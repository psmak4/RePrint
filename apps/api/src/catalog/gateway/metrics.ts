import type { Redis } from 'ioredis'

const REQUESTS_PREFIX = 'source:metrics:requests:'
const CACHE_KEY = 'source:metrics:cache'
/** Per-second counters live long enough for the "above 70% for an hour" alert (PRD §6) with room to spare. */
const REQUEST_COUNT_TTL_SECONDS = 2 * 60 * 60

export interface SourceMetrics {
  /** Counts one outgoing Source request in the current second. */
  recordRequest(): Promise<void>
  /** Counts a search-cache hit or miss. */
  recordCache(hit: boolean): Promise<void>
  /** Requests sent in the given epoch second. */
  requestsAt(epochSecond: number): Promise<number>
  cacheCounts(): Promise<{ hits: number; misses: number }>
}

export function createSourceMetrics(redis: Redis, now: () => number = Date.now): SourceMetrics {
  return {
    async recordRequest() {
      const key = `${REQUESTS_PREFIX}${Math.floor(now() / 1000)}`
      await redis.multi().incr(key).expire(key, REQUEST_COUNT_TTL_SECONDS).exec()
    },
    async recordCache(hit) {
      await redis.hincrby(CACHE_KEY, hit ? 'hits' : 'misses', 1)
    },
    async requestsAt(epochSecond) {
      return Number((await redis.get(`${REQUESTS_PREFIX}${epochSecond}`)) ?? 0)
    },
    async cacheCounts() {
      const counts = await redis.hgetall(CACHE_KEY)
      return { hits: Number(counts.hits ?? 0), misses: Number(counts.misses ?? 0) }
    },
  }
}
