import type { Database } from '@reprint/db'
import { type ConnectionOptions, type Job, Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'
import type { Mailer } from '../email/mailer.js'
import type { Alert } from '../observability/sentry.js'
import type { ImageStorage } from '../storage/index.js'
import { createJobQueue, QUEUE_NAME, workerConnection } from './queue.js'
import { isJobName, type JobContext, jobs } from './registry.js'

export interface RunningWorker {
  /** Finishes the jobs in progress, then closes every connection. */
  stop: () => Promise<void>
}

async function processJob(
  job: Job,
  services: Omit<JobContext, 'log'>,
  log: Logger,
): Promise<unknown> {
  if (!isJobName(job.name)) throw new Error(`No handler registered for job "${job.name}"`)
  const definition = jobs[job.name]
  const payload = definition.payload.parse(job.data)
  // The handler type is a union over every job; the payload was just parsed with this job's schema.
  return (definition.handler as (payload: unknown, context: JobContext) => Promise<unknown>)(
    payload,
    {
      log: log.child({ job: job.name, jobId: job.id }),
      ...services,
    },
  )
}

export async function startWorker(options: {
  redisUrl: string
  log: Logger
  mailer: Mailer
  db: Database
  /** For jobs that fill caches; the caller owns and closes it. */
  redis: Redis
  storage: ImageStorage
  catalog: JobContext['catalog']
  /** Called for every failed job (the entry point wires this to Sentry). */
  onJobError?: (error: unknown) => void
  /** `SOURCE_RATE_LIMIT_RPS`, for the monitor job. */
  sourceRps: number
  /** Called for every alert the monitor job raises (the entry point wires this to Sentry). */
  onAlert?: (alert: Alert) => void
}): Promise<RunningWorker> {
  const { redisUrl, log, mailer, db, redis, storage, catalog, onJobError, sourceRps, onAlert } =
    options
  const jobQueue = createJobQueue(redisUrl)
  const connection = workerConnection(redisUrl)
  connection.on('error', (error) => log.warn({ err: error }, 'redis connection error'))
  const worker = new Worker(
    QUEUE_NAME,
    (job) =>
      processJob(
        job,
        {
          mailer,
          db,
          redis,
          storage,
          catalog,
          queue: jobQueue.queue,
          sourceRps,
          alert: onAlert ?? (() => {}),
        },
        log,
      ),
    {
      connection: connection as ConnectionOptions,
      concurrency: 5,
    },
  )
  worker.on('failed', (job, error) => {
    log.error({ err: error, job: job?.name, jobId: job?.id }, 'job failed')
    onJobError?.(error)
  })
  worker.on('error', (error) => log.warn({ err: error }, 'worker error'))
  await worker.waitUntilReady()
  await jobQueue.syncSchedules()
  return {
    stop: async () => {
      await worker.close()
      await jobQueue.close()
      connection.disconnect()
    },
  }
}
