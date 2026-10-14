import { type ConnectionOptions, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { ReadinessCheck } from '../modules/ops/readiness.js'
import { type JobDefinition, type JobName, type JobPayload, jobs } from './registry.js'

export const QUEUE_NAME = 'reprint'

export interface EnqueueOptions {
  /** A second job with the same ID is ignored while the first is still stored, so callers can dedupe. */
  jobId?: string
  /**
   * A second job with the same deduplication ID is ignored only while the first is waiting or
   * running; once it completes or fails, a new one is added (D-199).
   */
  deduplicationId?: string
  /** BullMQ priority: 1 runs first and larger numbers wait behind smaller ones. */
  priority?: number
}

/** Only queue-name-specific keys: `bull:reprint:*`. Keeps job data apart from other Redis use. */
export interface JobQueue {
  queue: Queue
  /** Validates the payload against the job's schema, then adds it. Returns the job ID. */
  enqueue: <Name extends JobName>(
    name: Name,
    payload: JobPayload<Name>,
    options?: EnqueueOptions,
  ) => Promise<string>
  /**
   * Adds many jobs of one kind in one round trip to Redis, each validated first and deduplicated
   * as `enqueue` would (M10-T11). Returns the job IDs in order.
   */
  enqueueMany: <Name extends JobName>(
    name: Name,
    items: readonly { payload: JobPayload<Name>; options?: EnqueueOptions }[],
  ) => Promise<string[]>
  /** Creates or updates the repeatable schedule of every job that declares one. */
  syncSchedules: () => Promise<void>
  close: () => Promise<void>
}

/** Workers block on Redis, so BullMQ needs `maxRetriesPerRequest: null` on their connection. */
export function workerConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

/** BullMQ options for one job: its ID or deduplication, its priority, and its retry policy. */
function jobOptions(definition: JobDefinition, options: EnqueueOptions | undefined) {
  const retry = definition.retry
  return {
    ...(options?.jobId && { jobId: options.jobId }),
    ...(options?.deduplicationId && { deduplication: { id: options.deduplicationId } }),
    ...(options?.priority && { priority: options.priority }),
    ...(retry && {
      attempts: retry.attempts,
      backoff: { type: 'exponential', delay: retry.backoffMs },
    }),
  }
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
    enqueue: async (name, payload, options) => {
      const definition: JobDefinition = jobs[name]
      const job = await queue.add(
        name,
        definition.payload.parse(payload),
        jobOptions(definition, options),
      )
      return String(job.id)
    },
    enqueueMany: async (name, items) => {
      if (items.length === 0) return []
      const definition: JobDefinition = jobs[name]
      // Every payload is checked before any job is added, so a bad one adds none.
      const bulk = items.map(({ payload, options }) => ({
        name,
        data: definition.payload.parse(payload),
        opts: jobOptions(definition, options),
      }))
      const added = await queue.addBulk(bulk)
      return added.map((job) => String(job.id))
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
