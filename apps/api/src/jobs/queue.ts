import { type ConnectionOptions, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { ReadinessCheck } from '../modules/ops/readiness.js'
import { type JobDefinition, type JobName, type JobPayload, jobs } from './registry.js'

export const QUEUE_NAME = 'reprint'

/** Only queue-name-specific keys: `bull:reprint:*`. Keeps job data apart from other Redis use. */
export interface JobQueue {
  queue: Queue
  /** Validates the payload against the job's schema, then adds it. Returns the job ID. */
  enqueue: <Name extends JobName>(name: Name, payload: JobPayload<Name>) => Promise<string>
  /** Creates or updates the repeatable schedule of every job that declares one. */
  syncSchedules: () => Promise<void>
  close: () => Promise<void>
}

/** Workers block on Redis, so BullMQ needs `maxRetriesPerRequest: null` on their connection. */
export function workerConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

export function createJobQueue(redisUrl: string): JobQueue {
  // Fail fast when Redis is down so callers (and /v1/ready) get an error instead of hanging.
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  connection.on('error', () => {}) // surfaced through queue.on('error') and readiness
  const queue = new Queue(QUEUE_NAME, {
    connection: connection as ConnectionOptions,
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 1000 },
  })
  queue.on('error', () => {})
  return {
    queue,
    enqueue: async (name, payload) => {
      const definition: JobDefinition = jobs[name]
      const retry = definition.retry
      const job = await queue.add(name, definition.payload.parse(payload), {
        ...(retry && {
          attempts: retry.attempts,
          backoff: { type: 'exponential', delay: retry.backoffMs },
        }),
      })
      return String(job.id)
    },
    syncSchedules: async () => {
      for (const [name, definition] of Object.entries(jobs)) {
        const schedule = 'schedule' in definition ? definition.schedule : undefined
        if (!schedule) continue
        await queue.upsertJobScheduler(
          name,
          { every: schedule.everyMs },
          { name, data: definition.payload.parse(schedule.payload) },
        )
      }
    },
    close: async () => {
      await queue.close()
      connection.disconnect()
    },
  }
}

/** Ready when the queue answers a job-count request (this exercises the Redis scripts BullMQ needs). */
export function queueCheck(jobQueue: Pick<JobQueue, 'queue'>): ReadinessCheck {
  return { name: 'queue', check: () => jobQueue.queue.getJobCounts('waiting') }
}
