import { adminSystemSchema } from '@reprint/shared'
import { Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createSourceMetrics } from '../../catalog/gateway/metrics.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'

let stack: TestStack
let app: FastifyInstance
let queue: Queue

beforeAll(async () => {
  stack = await startTestStack()
  // No worker runs here, so added jobs stay waiting.
  queue = new Queue('system-test', { connection: stack.redis.duplicate() })
  queue.on('error', () => {})
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    SOURCE_RATE_LIMIT_RPS: '2',
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis, queue })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await queue?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
  await queue.obliterate({ force: true })
  await stack.redis.flushdb()
})

async function person(roles: string[]) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  return {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
}

const get = (cookies?: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/v1/admin/system', cookies })

describe('GET /v1/admin/system', () => {
  it('reports Source rate, cache hit rate, breaker state, and queue depth', async () => {
    const metrics = createSourceMetrics(stack.redis)
    for (let i = 0; i < 6; i++) await metrics.recordRequest()
    for (const hit of [true, true, true, false]) await metrics.recordCache(hit)
    await metrics.recordBreakerOpen(60_000)
    await queue.add('a', {})
    await queue.add('b', {})

    const res = await get(await person(['admin']))
    expect(res.statusCode).toBe(200)
    const body = adminSystemSchema.parse(res.json())
    expect(body.source.requestsPerSecond).toBeCloseTo(0.1, 2)
    expect(body.source.limitPerSecond).toBe(2)
    expect(body.source.breakerOpen).toBe(true)
    expect(body.searchCache).toEqual({ hits: 3, misses: 1, hitRate: 0.75 })
    expect(body.queue.waiting).toBe(2)
    expect(body.queue.oldestWaitingSeconds).toBeGreaterThanOrEqual(0)
  })

  it('reads zero and null on a fresh system', async () => {
    const res = await get(await person(['admin']))
    const body = adminSystemSchema.parse(res.json())
    expect(body.source).toMatchObject({ requestsPerSecond: 0, breakerOpen: false })
    expect(body.searchCache.hitRate).toBeNull()
    expect(body.queue).toMatchObject({ waiting: 0, oldestWaitingSeconds: null })
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    expect((await get(await person(['moderator']))).statusCode).toBe(403)
    expect((await get(await person(['member']))).statusCode).toBe(403)
    expect((await get()).statusCode).toBe(401)
  })
})
