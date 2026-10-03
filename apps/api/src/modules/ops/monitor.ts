import { type Database, reviews } from '@reprint/db'
import type { Queue } from 'bullmq'
import { asc, eq } from 'drizzle-orm'
import type { Redis } from 'ioredis'
import { createSourceMetrics } from '../../catalog/gateway/metrics.js'
import type { Alert } from '../../observability/sentry.js'

/** PRD §11 thresholds. */
export const QUEUE_WAITING_LIMIT = 1000
export const QUEUE_OLDEST_LIMIT_MS = 15 * 60 * 1000
export const REVIEW_PENDING_LIMIT_MS = 48 * 60 * 60 * 1000
/** PRD §6: alert when usage stays above 70% of the Source limit for an hour. */
export const SOURCE_USAGE_FRACTION = 0.7
export const SOURCE_USAGE_WINDOW_SECONDS = 60 * 60

/** Enough waiting jobs to find the oldest one without reading a huge queue. */
const OLDEST_SAMPLE = 100

export interface MonitorOptions {
  db: Database
  redis: Redis
  queue: Queue
  /** `SOURCE_RATE_LIMIT_RPS`. */
  sourceRps: number
  now?: Date
}

/** Checks every PRD §11 alert condition and returns the ones that hold. The caller reports them. */
export async function runMonitor(options: MonitorOptions): Promise<Alert[]> {
  const { db, redis, queue, sourceRps } = options
  const now = options.now ?? new Date()
  const alerts: Alert[] = []

  const counts = await queue.getJobCounts('waiting', 'prioritized')
  const waiting = (counts.waiting ?? 0) + (counts.prioritized ?? 0)
  const sample = await queue.getJobs(['waiting', 'prioritized'], 0, OLDEST_SAMPLE - 1, true)
  // Ascending order puts the oldest jobs first; past the sample the age is a lower bound.
  const oldest = sample.reduce<number>(
    (max, job) => Math.max(max, now.getTime() - job.timestamp),
    0,
  )
  if (waiting > QUEUE_WAITING_LIMIT || oldest > QUEUE_OLDEST_LIMIT_MS) {
    alerts.push({
      signal: 'queue_stuck',
      message: 'The job queue is stuck',
      detail: { waiting, oldestWaitingMinutes: Math.round(oldest / 60_000) },
    })
  }

  const [pending] = await db
    .select({ submittedAt: reviews.submittedAt })
    .from(reviews)
    .where(eq(reviews.status, 'pending'))
    .orderBy(asc(reviews.submittedAt))
    .limit(1)
  if (pending && now.getTime() - pending.submittedAt.getTime() > REVIEW_PENDING_LIMIT_MS) {
    alerts.push({
      signal: 'review_queue_stale',
      message: 'The oldest pending review is more than 48 hours old',
      detail: { submittedAt: pending.submittedAt.toISOString() },
    })
  }

  const metrics = createSourceMetrics(redis)
  if (await metrics.breakerOpen()) {
    alerts.push({ signal: 'source_breaker_open', message: 'The Source circuit breaker is open' })
  }

  const toSecond = Math.floor(now.getTime() / 1000)
  const requests = await metrics.requestsBetween(
    toSecond - SOURCE_USAGE_WINDOW_SECONDS + 1,
    toSecond,
  )
  const usage = requests / (SOURCE_USAGE_WINDOW_SECONDS * sourceRps)
  if (usage > SOURCE_USAGE_FRACTION) {
    alerts.push({
      signal: 'source_usage_high',
      message: 'Source usage has been above 70% of the limit for an hour',
      detail: { usagePercent: Math.round(usage * 100), requests },
    })
  }

  return alerts
}
