import { createDb } from '@reprint/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { createCatalogRuntime } from './catalog/runtime.js'
import { EnvError, loadWorkerEnv } from './config/env.js'
import { createMailer } from './email/mailer.js'
import { startWorker } from './jobs/worker-runtime.js'
import { baseLoggerOptions } from './observability/logging.js'
import { captureError, initSentry } from './observability/sentry.js'
import { createImageStorage } from './storage/index.js'

async function main(): Promise<void> {
  const env = loadWorkerEnv()
  initSentry(env, 'worker')
  const log = pino({ ...baseLoggerOptions(env), base: { service: 'worker' } })
  const mailer = createMailer(env)
  const database = createDb(env.DATABASE_URL)
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 })
  redis.on('error', (error) => log.warn({ err: error }, 'redis connection error'))
  const catalog = createCatalogRuntime(env, redis)
  const worker = await startWorker({
    redisUrl: env.REDIS_URL,
    log,
    mailer,
    db: database.db,
    redis,
    storage: createImageStorage(env),
    catalog,
    onJobError: captureError,
  })
  log.info('worker ready')

  let stopping = false
  const shutdown = (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'worker stopping')
    worker
      .stop()
      .then(async () => {
        mailer.close()
        redis.disconnect()
        await database.close()
        process.exit(0)
      })
      .catch((error: unknown) => {
        log.error({ err: error }, 'worker failed to stop cleanly')
        process.exit(1)
      })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvError ? error.message : error)
  process.exit(1)
})
