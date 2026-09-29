import { authTokens, roles, sessions, userRoles, users } from '@reprint/db'
import { problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import type { JobName, JobPayload } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from './session-cookie.js'
import { hashToken } from './tokens.js'

const ORIGIN = 'http://www.reprint.test:5173'
const HOUR_MS = 60 * 60 * 1000

let stack: TestStack
let app: FastifyInstance
let enqueued: { name: JobName; payload: JobPayload<JobName> }[]

const validBody = {
  email: 'ada@example.test',
  username: 'ada_l',
  password: 'correct horse battery',
}

function register(body: unknown, remoteAddress = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: ORIGIN },
    remoteAddress,
    payload: body as Record<string, unknown>,
  })
}

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
  })
  enqueued = []
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: {
      enqueue: async (name, payload) => {
        enqueued.push({ name, payload })
        return String(enqueued.length)
      },
    },
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
  enqueued.length = 0
})

describe('POST /v1/auth/register', () => {
  it('creates a Member, signs them in unverified, and queues a 24-hour verification email', async () => {
    const before = Date.now()
    const response = await register(validBody)
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ status: 'check_your_email' })

    const [user] = await stack.db.db.select().from(users)
    expect(user).toMatchObject({
      email: 'ada@example.test',
      username: 'ada_l',
      displayName: 'ada_l',
      status: 'active',
      emailVerifiedAt: null,
    })
    expect(user?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(user?.passwordHash).not.toContain(validBody.password)

    const granted = await stack.db.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, user?.id ?? ''))
    expect(granted).toEqual([{ name: 'member' }])

    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)
    expect(cookie).toBeDefined()
    const [session] = await stack.db.db.select().from(sessions)
    expect(session?.userId).toBe(user?.id)
    expect(session?.tokenHash).toBe(hashToken(cookie?.value ?? ''))

    const [token] = await stack.db.db.select().from(authTokens)
    expect(token).toMatchObject({ userId: user?.id, purpose: 'verify_email', usedAt: null })
    const ttl = (token?.expiresAt.getTime() ?? 0) - before
    expect(ttl).toBeGreaterThan(24 * HOUR_MS - 60_000)
    expect(ttl).toBeLessThanOrEqual(24 * HOUR_MS + 60_000)

    expect(enqueued).toHaveLength(1)
    const job = enqueued[0]
    expect(job?.name).toBe('email.send')
    const payload = job?.payload as { template: string; to: string; props: { verifyUrl: string } }
    expect(payload).toMatchObject({ template: 'verify-email', to: 'ada@example.test' })
    const link = new URL(payload.props.verifyUrl)
    expect(link.origin).toBe(ORIGIN)
    expect(link.pathname).toBe('/verify-email')
    const raw = link.searchParams.get('token') ?? ''
    expect(hashToken(raw)).toBe(token?.tokenHash)
    expect(JSON.stringify(await stack.db.db.select().from(authTokens))).not.toContain(raw)
  })

  it('reports a username that differs only by case as taken, with a field error', async () => {
    await register(validBody)
    const response = await register({
      ...validBody,
      email: 'other@example.test',
      username: 'ADA_L',
    })
    expect(response.statusCode).toBe(400)
    const body = problemDetailsSchema.parse(response.json())
    expect(body.errors).toEqual([{ path: 'body.username', message: 'That username is taken.' }])
    expect(await stack.db.db.select().from(users)).toHaveLength(1)
  })

  it.each([
    ['a short username', { username: 'ab' }, 'body.username'],
    ['a username with a dash', { username: 'ada-l' }, 'body.username'],
    ['an 11-character password', { password: 'elevenchars' }, 'body.password'],
    ['an invalid email', { email: 'not-an-email' }, 'body.email'],
  ])('rejects %s with a field error', async (_label, override, path) => {
    const response = await register({ ...validBody, ...override })
    expect(response.statusCode).toBe(400)
    const body = problemDetailsSchema.parse(response.json())
    expect(body.errors?.map((error) => error.path)).toContain(path)
    expect(await stack.db.db.select().from(users)).toHaveLength(0)
  })

  it('answers a taken email like a new registration, creates no account, and emails the owner (D-048)', async () => {
    const owner = await createTestUser(stack.db.db)
    const response = await register({ ...validBody, email: owner.email.toUpperCase() })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ status: 'check_your_email' })

    expect(await stack.db.db.select().from(users)).toHaveLength(1)
    expect(await stack.db.db.select().from(authTokens)).toHaveLength(0)
    expect(await stack.db.db.select().from(sessions)).toHaveLength(0)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.payload).toMatchObject({
      template: 'email-already-registered',
      to: owner.email.toUpperCase(),
      props: { username: owner.username },
    })
  })

  it('refuses a request from a foreign origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: 'https://evil.example' },
      payload: validBody,
    })
    expect(response.statusCode).toBe(403)
  })

  it('returns 429 with Retry-After on the 6th registration from one IP within an hour', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await register(
        {
          email: `user${i}@example.test`,
          username: `user_${i}`,
          password: 'correct horse battery',
        },
        '10.9.9.9',
      )
      expect(response.statusCode).toBe(201)
    }
    const sixth = await register(
      { email: 'user5@example.test', username: 'user_5', password: 'correct horse battery' },
      '10.9.9.9',
    )
    expect(sixth.statusCode).toBe(429)
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0)
    expect(problemDetailsSchema.parse(sixth.json()).status).toBe(429)

    const otherIp = await register(
      { email: 'user6@example.test', username: 'user_6', password: 'correct horse battery' },
      '10.9.9.10',
    )
    expect(otherIp.statusCode).toBe(201)
  })
})

describe('POST /v1/auth/register with HIBP_MODE=live', () => {
  it('refuses a breached password with a field error and creates nothing', async () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_ORIGINS: ORIGIN,
      DATABASE_URL: stack.databaseUrl,
      REDIS_URL: stack.redisUrl,
      HIBP_MODE: 'live',
    })
    const liveApp = await buildApp(env, {
      database: stack.db.db,
      redis: stack.redis,
      jobs: { enqueue: async () => '1' },
    })
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch
    try {
      // Fail open: the API being down must not block registration (D-029).
      const open = await liveApp.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin: ORIGIN },
        payload: validBody,
      })
      expect(open.statusCode).toBe(201)

      const { createHash } = await import('node:crypto')
      const digest = createHash('sha1').update('password1234567').digest('hex').toUpperCase()
      globalThis.fetch = (async (input: string | URL | Request) => {
        expect(String(input)).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`)
        return new Response(`${digest.slice(5)}:12345\r\n`)
      }) as typeof fetch
      const response = await liveApp.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers: { origin: ORIGIN },
        payload: { email: 'b@example.test', username: 'bob_b', password: 'password1234567' },
      })
      expect(response.statusCode).toBe(400)
      expect(problemDetailsSchema.parse(response.json()).errors?.[0]?.path).toBe('body.password')
      expect(await stack.db.db.select().from(users)).toHaveLength(1)
    } finally {
      globalThis.fetch = realFetch
      await liveApp.close()
    }
  })
})
