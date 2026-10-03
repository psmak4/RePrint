import { type AdminSystem, adminSystemSchema } from '@reprint/shared'
import type { Queue } from 'bullmq'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import { createSourceMetrics } from '../../catalog/gateway/metrics.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

/** The rate is averaged over this many seconds so one quiet second doesn't read as zero. */
const RATE_WINDOW_SECONDS = 60
/** Enough waiting jobs to find the oldest one without reading a huge queue. */
const OLDEST_SAMPLE = 100

export interface AdminSystemRoutesOptions extends AuthRoutesOptions {
  redis?: Redis
  queue?: Queue
}

/** Source usage, search cache, and queue health from the Redis counters and the job queue (PRD §6). */
export async function readSystem(
  redis: Redis,
  queue: Queue,
  limitPerSecond: number,
  now: Date = new Date(),
): Promise<AdminSystem> {
  const metrics = createSourceMetrics(redis)
  const toSecond = Math.floor(now.getTime() / 1000)
  const [requests, cache, breakerOpen, counts, sample] = await Promise.all([
    metrics.requestsBetween(toSecond - RATE_WINDOW_SECONDS + 1, toSecond),
    metrics.cacheCounts(),
    metrics.breakerOpen(),
    queue.getJobCounts('waiting', 'prioritized', 'active', 'delayed', 'failed'),
    queue.getJobs(['waiting', 'prioritized'], 0, OLDEST_SAMPLE - 1, true),
  ])
  const lookups = cache.hits + cache.misses
  const oldest = sample.reduce<number | null>(
    (max, job) => Math.max(max ?? 0, now.getTime() - job.timestamp),
    null,
  )
  return {
    generatedAt: now.toISOString(),
    source: {
      requestsPerSecond: Math.round((requests / RATE_WINDOW_SECONDS) * 100) / 100,
      limitPerSecond,
      breakerOpen,
    },
    searchCache: {
      hits: cache.hits,
      misses: cache.misses,
      hitRate: lookups === 0 ? null : cache.hits / lookups,
    },
    queue: {
      waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      oldestWaitingSeconds: oldest === null ? null : Math.max(0, Math.round(oldest / 1000)),
    },
  }
}

export const adminSystemRoutes: FastifyPluginAsyncZod<AdminSystemRoutesOptions> = async (
  app,
  options,
) => {
  const { env, redis, queue } = options
  const manage = requirePermission('catalog.manage')
  app.get(
    '/admin/system',
    {
      preHandler: [manage],
      schema: { response: { 200: adminSystemSchema } },
    },
    async (): Promise<AdminSystem> => {
      if (!redis || !queue) throw new Error('the system dashboard needs Redis and the job queue')
      return readSystem(redis, queue, env.SOURCE_RATE_LIMIT_RPS)
    },
  )
}
