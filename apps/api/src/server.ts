import { createDb } from '@reprint/db'
import { Redis } from 'ioredis'
import { buildApp } from './app.js'
import { EnvError, loadEnv } from './config/env.js'
import { postgresCheck, redisCheck } from './modules/ops/readiness.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const database = createDb(env.DATABASE_URL)
  // Connect lazily so the API can start (and report not ready) while Redis is down.
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  const app = await buildApp(env, {
    readinessChecks: [postgresCheck(database), redisCheck(redis)],
  })
  // Connection errors are reported through /v1/ready; log them without crashing or spamming stderr.
  redis.on('error', (error) => app.log.warn({ err: error }, 'redis connection error'))
  app.addHook('onClose', async () => {
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
