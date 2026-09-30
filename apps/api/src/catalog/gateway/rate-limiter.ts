import type { Redis } from 'ioredis'

export const REQUEST_PRIORITIES = ['interactive', 'background'] as const
/** Interactive: search and a first view of a Book. Background: refreshes (PRD §6). */
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number]

const NEXT_KEY = 'source:limiter:next'
const WAITING_KEY = 'source:limiter:waiting'

/**
 * Hands out one request slot every `interval` ms, using the Redis clock so every process agrees.
 * ARGV: interval (ms), priority (1 = interactive, 0 = background), waiter id, waiter expiry (ms).
 * Returns 0 when the caller holds a slot, otherwise how many ms to wait before asking again.
 * Interactive callers stay in the `waiting` set until they get a slot; background callers are
 * refused while it holds anyone, so interactive requests always go first.
 */
const ACQUIRE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local interval = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local interactive = ARGV[2] == '1'
if interactive then
  redis.call('ZADD', KEYS[2], now + tonumber(ARGV[4]), ARGV[3])
elseif redis.call('ZCARD', KEYS[2]) > 0 then
  return math.max(1, math.ceil(interval / 2))
end
local nextAt = tonumber(redis.call('GET', KEYS[1]) or '0')
if nextAt > now then return nextAt - now end
redis.call('SET', KEYS[1], now + interval, 'PX', math.ceil(interval) * 10)
if interactive then redis.call('ZREM', KEYS[2], ARGV[3]) end
return 0
`

export interface SourceRateLimiterOptions {
  redis: Redis
  /** Requests per second across every process. */
  rps: number
  sleep?: (ms: number) => Promise<void>
}

export class RateLimitWaitError extends Error {
  constructor() {
    super('Timed out waiting for a Source request slot')
    this.name = 'RateLimitWaitError'
  }
}

let waiterCounter = 0

/** One Redis-backed limiter for every outgoing Source call (PRD §6). */
export function createSourceRateLimiter(options: SourceRateLimiterOptions) {
  const interval = 1000 / options.rps
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  return {
    /** Resolves when the caller may send one request; rejects with `RateLimitWaitError` after `maxWaitMs`. */
    async acquire(priority: RequestPriority, maxWaitMs: number): Promise<void> {
      const deadline = Date.now() + maxWaitMs
      waiterCounter += 1
      const waiterId = `${process.pid}:${waiterCounter}`
      try {
        for (;;) {
          const waitMs = (await options.redis.eval(
            ACQUIRE_SCRIPT,
            2,
            NEXT_KEY,
            WAITING_KEY,
            interval,
            priority === 'interactive' ? '1' : '0',
            waiterId,
            // A waiter that dies without leaving stops blocking background work after this long.
            maxWaitMs + 1000,
          )) as number
          if (waitMs <= 0) return
          if (Date.now() + waitMs > deadline) throw new RateLimitWaitError()
          await sleep(waitMs)
        }
      } catch (error) {
        if (priority === 'interactive') await options.redis.zrem(WAITING_KEY, waiterId)
        throw error
      }
    },
  }
}

export type SourceRateLimiter = ReturnType<typeof createSourceRateLimiter>
