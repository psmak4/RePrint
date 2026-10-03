import type { Redis } from 'ioredis'

const REQUESTS_PREFIX = 'source:metrics:requests:'
const CACHE_KEY = 'source:metrics:cache'
/** Set while any process sees the breaker open, so the worker's monitor can alert on it (PRD §11). */
const BREAKER_KEY = 'source:metrics:breaker-open'
/** Per-second counters live long enough for the "above 70% for an hour" alert (PRD §6) with room to spare. */
const REQUEST_COUNT_TTL_SECONDS = 2 * 60 * 60

export interface SourceMetrics {
  /** Counts one outgoing Source request in the current second. */
  recordRequest(): Promise<void>
  /** Counts a search-cache hit or miss. */
  recordCache(hit: boolean): Promise<void>
  /** Requests sent in the given epoch second. */
  requestsAt(epochSecond: number): Promise<number>
  /** Total requests sent in the seconds `fromSecond` to `toSecond`, both included. */
  requestsBetween(fromSecond: number, toSecond: number): Promise<number>
  cacheCounts(): Promise<{ hits: number; misses: number }>
  /** Marks the breaker open for `ttlMs`; the mark lapses on its own if no later failure renews it. */
  recordBreakerOpen(ttlMs: number): Promise<void>
  recordBreakerClosed(): Promise<void>
  breakerOpen(): Promise<boolean>
}

const MGET_CHUNK = 1000

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
    async requestsBetween(fromSecond, toSecond) {
      let total = 0
      for (let start = fromSecond; start <= toSecond; start += MGET_CHUNK) {
        const keys: string[] = []
        for (let second = start; second <= Math.min(toSecond, start + MGET_CHUNK - 1); second++) {
          keys.push(`${REQUESTS_PREFIX}${second}`)
        }
        for (const value of await redis.mget(keys)) total += Number(value ?? 0)
      }
      return total
    },
    async recordBreakerOpen(ttlMs) {
      await redis.set(BREAKER_KEY, '1', 'PX', ttlMs)
    },
    async recordBreakerClosed() {
      await redis.del(BREAKER_KEY)
    },
    async breakerOpen() {
      return (await redis.exists(BREAKER_KEY)) === 1
    },
    async cacheCounts() {
      const counts = await redis.hgetall(CACHE_KEY)
      return { hits: Number(counts.hits ?? 0), misses: Number(counts.misses ?? 0) }
    },
  }
}
