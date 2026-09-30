import { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createSourceGateway } from './gateway.js'
import { createSourceMetrics } from './metrics.js'
import { createSourceRateLimiter } from './rate-limiter.js'

let stack: TestStack
let second: Redis

beforeAll(async () => {
  stack = await startTestStack()
  second = new Redis(stack.redisUrl)
  second.on('error', () => {})
})
afterAll(async () => {
  second.disconnect()
  await stack.stop()
})
beforeEach(() => stack.reset())

describe('source rate limiter', () => {
  it('shares one limit across two Redis connections', async () => {
    const rps = 5
    const a = createSourceRateLimiter({ redis: stack.redis, rps })
    const b = createSourceRateLimiter({ redis: second, rps })
    const started = Date.now()
    await Promise.all([
      a.acquire('interactive', 5000),
      b.acquire('interactive', 5000),
      a.acquire('interactive', 5000),
      b.acquire('interactive', 5000),
      a.acquire('interactive', 5000),
    ])
    // 5 slots at 5 per second: the fifth is granted no sooner than 4 intervals (800 ms) after the first.
    expect(Date.now() - started).toBeGreaterThanOrEqual(700)
  })

  it('serves interactive requests before queued background ones', async () => {
    const limiter = createSourceRateLimiter({ redis: stack.redis, rps: 4 })
    await limiter.acquire('interactive', 1000) // takes the current slot
    const order: string[] = []
    const background = limiter.acquire('background', 5000).then(() => order.push('background'))
    await new Promise((resolve) => setTimeout(resolve, 50)) // the background request is already queued
    const interactive = second
    const other = createSourceRateLimiter({ redis: interactive, rps: 4 })
    await Promise.all([
      other.acquire('interactive', 5000).then(() => order.push('interactive')),
      background,
    ])
    expect(order).toEqual(['interactive', 'background'])
  })

  it('gives up after the maximum wait', async () => {
    const limiter = createSourceRateLimiter({ redis: stack.redis, rps: 0.5 })
    await limiter.acquire('interactive', 1000)
    await expect(limiter.acquire('interactive', 200)).rejects.toThrow(/slot/)
    // A background request is not blocked by the abandoned interactive waiter.
    await expect(stack.redis.zcard('source:limiter:waiting')).resolves.toBe(0)
  })
})

describe('source gateway with Redis', () => {
  it('records per-second request counts and cache hit and miss counters', async () => {
    const gateway = createSourceGateway({
      redis: stack.redis,
      rps: 50,
      timeoutMs: 2000,
      version: '0.0.0',
      contactEmail: 'ops@reprint.com',
      fetch: async () => new Response('{}'),
    })
    const before = Math.floor(Date.now() / 1000)
    await gateway.fetch('https://example.test/a')
    await gateway.fetch('https://example.test/b')
    const metrics = createSourceMetrics(stack.redis)
    const total = (await metrics.requestsAt(before)) + (await metrics.requestsAt(before + 1))
    expect(total).toBe(2)
    await metrics.recordCache(true)
    await metrics.recordCache(true)
    await metrics.recordCache(false)
    await expect(metrics.cacheCounts()).resolves.toEqual({ hits: 2, misses: 1 })
  })
})
