import { createDb } from '@reprint/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { buildApp } from './app.js'
import { createCatalogRuntime } from './catalog/runtime.js'
import { EnvError, loadEnv } from './config/env.js'
import { createMailer } from './email/mailer.js'
import { createJobQueue, queueCheck } from './jobs/queue.js'
import { startWorker } from './jobs/worker-runtime.js'
import { postgresCheck, redisCheck } from './modules/ops/readiness.js'
import { baseLoggerOptions } from './observability/logging.js'
import { captureError, initSentry } from './observability/sentry.js'
import { createImageStorage } from './storage/index.js'

async function main(): Promise<void> {
  const env = loadEnv()
  initSentry(env, 'api')
  const database = createDb(env.DATABASE_URL)
  // Connect lazily so the API can start (and report not ready) while Redis is down.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  const jobQueue = createJobQueue(env.REDIS_URL)
  const catalog = createCatalogRuntime(env, redis)
  const app = await buildApp(env, {
    catalog,
    database: database.db,
    redis,
    jobs: jobQueue,
    readinessChecks: [postgresCheck(database), redisCheck(redis), queueCheck(jobQueue)],
  })
  // Connection errors are reported through /v1/ready; log them without crashing or spamming stderr.
  redis.on('error', (error) => app.log.warn({ err: error }, 'redis connection error'))
  const mailer = createMailer(env)
  // Free-tier staging has no background workers, so the API can run the jobs itself (D-071).
  const worker = env.WORKER_IN_PROCESS
    ? await startWorker({
        redisUrl: env.REDIS_URL,
        log: pino({ ...baseLoggerOptions(env), base: { service: 'worker' } }),
        mailer,
        db: database.db,
        redis,
        storage: createImageStorage(env),
        catalog,
        onJobError: captureError,
      })
    : undefined
  app.addHook('onClose', async () => {
    await worker?.stop()
    mailer.close()
    await jobQueue.close()
    redis.disconnect()
    await database.close()
  })
  await app.listen({ host: env.HOST, port: env.PORT })
}

main().catch((error: unknown) => {
  // Env problems get a plain message (no stack) so a missing variable is obvious.
  console.error(error instanceof EnvError ? error.message : error)
  process.exit(1)
})
