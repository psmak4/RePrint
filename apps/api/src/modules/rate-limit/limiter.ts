import { createHash } from 'node:crypto'
import type { Redis } from 'ioredis'
import type { RateLimitPolicy } from './policies.js'

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets; use it for `Retry-After`. */
  retryAfterSeconds: number
}

// Count and set the expiry in one step, so a crash can't leave a counter that never expires.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return {count, ttl}
`

/** Emails and account names are hashed so no personal data sits in Redis keys. */
export function hashSubject(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/** Fixed-window counter in Redis, so every API instance shares the same counts. */
export function createRateLimiter(redis: Redis) {
  return {
    async consume(
      name: string,
      policy: RateLimitPolicy,
      subject: string,
    ): Promise<RateLimitResult> {
      const key = `rl:${name}:${subject}`
      const [count, ttlMs] = (await redis.eval(
        CONSUME_SCRIPT,
        1,
        key,
        policy.windowSeconds * 1000,
      )) as [number, number]
      return {
        allowed: count <= policy.limit,
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      }
    },
  }
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
