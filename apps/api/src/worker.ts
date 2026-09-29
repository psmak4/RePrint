import { pino } from 'pino'
import { EnvError, loadWorkerEnv } from './config/env.js'
import { startWorker } from './jobs/worker-runtime.js'

async function main(): Promise<void> {
  const env = loadWorkerEnv()
  const log = pino({
    level: env.LOG_LEVEL,
    base: { service: 'worker' },
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  })
  const worker = await startWorker({ redisUrl: env.REDIS_URL, log })
  log.info('worker ready')

  let stopping = false
  const shutdown = (signal: string) => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'worker stopping')
    worker.stop().then(
      () => process.exit(0),
      (error: unknown) => {
        log.error({ err: error }, 'worker failed to stop cleanly')
        process.exit(1)
      },
    )
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  console.error(error instanceof EnvError ? error.message : error)
  process.exit(1)
})
