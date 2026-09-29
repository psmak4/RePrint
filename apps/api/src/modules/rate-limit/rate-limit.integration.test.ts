import { problemDetailsSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'
import { rateLimit } from './plugin.js'

const ORIGIN = 'http://www.reprint.test:5173'

let stack: TestStack
let app: FastifyInstance
let otherInstance: FastifyInstance

function envFor() {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
}

async function buildTestApp() {
  const instance = await buildApp(envFor(), { database: stack.db.db, redis: stack.redis })
  instance.post('/test/login', { preHandler: [rateLimit('loginIp')] }, async () => ({ ok: true }))
  instance.post(
    '/test/account',
    {
      preHandler: [
        rateLimit('loginAccount', (request) => (request.body as { email?: string }).email),
      ],
    },
    async () => ({ ok: true }),
  )
  instance.post(
    '/test/reset',
    {
      preHandler: [
        rateLimit('passwordReset', (request) => (request.body as { email?: string }).email),
      ],
    },
    async () => ({ ok: true }),
  )
  instance.post('/test/review', { preHandler: [rateLimit('reviewWrite')] }, async () => ({
    ok: true,
  }))
  instance.get('/test/read', async () => ({ ok: true }))
  instance.post('/test/write', async () => ({ ok: true }))
  instance.get('/test/start/:userId', async (request, reply) => {
    await instance.sessions.start(request, reply, (request.params as { userId: string }).userId)
    return { ok: true }
  })
  await instance.ready()
  return instance
}

beforeAll(async () => {
  stack = await startTestStack()
  app = await buildTestApp()
  otherInstance = await buildTestApp()
})

afterAll(async () => {
  await app?.close()
  await otherInstance?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

const post = (
  instance: FastifyInstance,
  url: string,
  options: { ip?: string; body?: object; cookie?: string } = {},
) =>
  instance.inject({
    method: 'POST',
    url,
    remoteAddress: options.ip ?? '10.0.0.1',
    headers: { origin: ORIGIN, ...(options.cookie ? { cookie: options.cookie } : {}) },
    payload: options.body ?? {},
  })

async function expectRateLimited(
  response: Awaited<ReturnType<typeof post>>,
  windowSeconds = 15 * 60,
) {
  expect(response.statusCode).toBe(429)
  expect(response.headers['content-type']).toContain('application/problem+json')
  expect(problemDetailsSchema.parse(response.json()).status).toBe(429)
  const retryAfter = Number(response.headers['retry-after'])
  expect(retryAfter).toBeGreaterThan(0)
  expect(retryAfter).toBeLessThanOrEqual(windowSeconds)
}

describe('per-IP policies', () => {
  it('allows 10 logins per IP, then returns 429 with Retry-After; other IPs are unaffected', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post(app, '/test/login')).statusCode).toBe(200)
    }
    await expectRateLimited(await post(app, '/test/login'))
    expect((await post(app, '/test/login', { ip: '10.0.0.2' })).statusCode).toBe(200)
  })

  it('limits anonymous reads to 300 per minute per IP, but not health checks', async () => {
    for (let i = 0; i < 300; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/test/read',
        remoteAddress: '10.0.0.3',
      })
      expect(response.statusCode).toBe(200)
    }
    const blocked = await app.inject({
      method: 'GET',
      url: '/test/read',
      remoteAddress: '10.0.0.3',
    })
    await expectRateLimited(blocked, 60)
    const health = await app.inject({ method: 'GET', url: '/v1/health', remoteAddress: '10.0.0.3' })
    expect(health.statusCode).toBe(200)
  })
})

describe('per-email and per-account policies', () => {
  it('counts each email separately and ignores case', async () => {
    for (let i = 0; i < 3; i++) {
      const email = i % 2 ? 'ADA@example.com' : 'ada@example.com'
      expect((await post(app, '/test/reset', { body: { email } })).statusCode).toBe(200)
    }
    await expectRateLimited(
      await post(app, '/test/reset', { body: { email: 'Ada@Example.com' } }),
      60 * 60,
    )
    expect(
      (await post(app, '/test/reset', { body: { email: 'bob@example.com' } })).statusCode,
    ).toBe(200)
  })

  it('allows 5 attempts per account, whatever the IP', async () => {
    for (let i = 0; i < 5; i++) {
      const ip = `10.0.1.${i + 1}`
      expect(
        (await post(app, '/test/account', { ip, body: { email: 'a@example.com' } })).statusCode,
      ).toBe(200)
    }
    await expectRateLimited(
      await post(app, '/test/account', { ip: '10.0.1.99', body: { email: 'a@example.com' } }),
    )
  })

  it('stores no plain email in Redis keys', async () => {
    await post(app, '/test/reset', { body: { email: 'ada@example.com' } })
    const keys = await stack.redis.keys('rl:*')
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toContain('ada')
  })
})

describe('per-user policies', () => {
  async function signedIn() {
    const user = await createTestUser(stack.db.db)
    const start = await app.inject({
      method: 'GET',
      url: `/test/start/${user.id}`,
      remoteAddress: '10.0.2.1',
    })
    const token = start.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value
    return { user, cookie: `${SESSION_COOKIE}=${token}` }
  }

  it('allows 20 review writes per user per day, then 429; another user is unaffected', async () => {
    const first = await signedIn()
    const second = await signedIn()
    for (let i = 0; i < 20; i++) {
      expect((await post(app, '/test/review', { cookie: first.cookie })).statusCode).toBe(200)
    }
    const blocked = await post(app, '/test/review', { cookie: first.cookie })
    expect(blocked.statusCode).toBe(429)
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(60 * 60)
    expect((await post(app, '/test/review', { cookie: second.cookie })).statusCode).toBe(200)
  })

  it('allows 120 authenticated writes per minute per user, whatever the IP', async () => {
    const { cookie } = await signedIn()
    for (let i = 0; i < 120; i++) {
      expect((await post(app, '/test/write', { cookie, ip: `10.0.3.${i % 200}` })).statusCode).toBe(
        200,
      )
    }
    await expectRateLimited(await post(app, '/test/write', { cookie }), 60)
  })

  it('does not count authenticated reads against the write limit', async () => {
    const { cookie } = await signedIn()
    for (let i = 0; i < 130; i++) {
      const response = await app.inject({ method: 'GET', url: '/test/read', headers: { cookie } })
      expect(response.statusCode).toBe(200)
    }
  })
})

describe('shared state', () => {
  it('shares counts across two app instances on one Redis', async () => {
    for (let i = 0; i < 10; i++) {
      const instance = i % 2 ? otherInstance : app
      expect((await post(instance, '/test/login')).statusCode).toBe(200)
    }
    await expectRateLimited(await post(otherInstance, '/test/login'))
    await expectRateLimited(await post(app, '/test/login'))
  })

  it('fails open when Redis is unreachable', async () => {
    const isolated = await buildTestApp()
    await stack.stopRedis()
    const response = await post(isolated, '/test/login')
    expect(response.statusCode).toBe(200)
    await isolated.close()
  })
})
