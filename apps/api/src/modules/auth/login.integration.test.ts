import { sessions, users } from '@reprint/db'
import { problemDetailsSchema, sessionResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword } from './password.js'
import { SESSION_COOKIE } from './session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const PASSWORD = 'correct horse battery staple'

let stack: TestStack
let app: FastifyInstance

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
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

async function accountWithPassword(options: Parameters<typeof createTestUser>[1] = {}) {
  const user = await createTestUser(stack.db.db, options)
  await stack.db.db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, user.id))
  return user
}

function post(url: string, payload?: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url,
    headers: { origin: ORIGIN },
    payload,
    ...extra,
  })
}

const login = (email: string, password: string, remoteAddress = '10.0.0.1') =>
  post('/v1/auth/login', { email, password }, { remoteAddress })

function cookieOf(response: Awaited<ReturnType<typeof login>>): string {
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)
  if (!cookie?.value) throw new Error('no session cookie')
  return cookie.value
}

async function viewerFor(token: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/auth/session',
    cookies: { [SESSION_COOKIE]: token },
  })
  return sessionResponseSchema.parse(response.json()).viewer
}

describe('POST /v1/auth/login', () => {
  it('signs in with the right email and password', async () => {
    const user = await accountWithPassword()
    const response = await login(user.email.toUpperCase(), PASSWORD)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'logged_in' })
    expect((await viewerFor(cookieOf(response)))?.id).toBe(user.id)
  })

  it('gives the same 401 body for a wrong password and an unknown email', async () => {
    const user = await accountWithPassword()
    const wrongPassword = await login(user.email, 'not the password')
    const unknownEmail = await login('nobody@example.test', PASSWORD)
    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownEmail.statusCode).toBe(401)
    expect(unknownEmail.json()).toEqual(wrongPassword.json())
    expect(wrongPassword.cookies).toHaveLength(0)
  })

  it('spends similar time on an unknown email and a wrong password', async () => {
    const user = await accountWithPassword()
    await login(user.email, 'warm up', '10.0.1.1')
    const time = async (email: string, ip: string) => {
      const started = performance.now()
      await login(email, 'not the password', ip)
      return performance.now() - started
    }
    const known = await time(user.email, '10.0.1.2')
    const unknown = await time('nobody@example.test', '10.0.1.3')
    // Both run one Argon2id verification; a skipped hash would be an order of magnitude faster.
    expect(unknown).toBeGreaterThan(known * 0.4)
  })

  it('refuses a suspended account with a message only after a correct password (D-047)', async () => {
    const user = await accountWithPassword({ status: 'suspended' })
    const right = await login(user.email, PASSWORD)
    expect(right.statusCode).toBe(403)
    expect(JSON.stringify(problemDetailsSchema.parse(right.json()))).toContain('suspended')
    expect(right.cookies).toHaveLength(0)

    const wrong = await login(user.email, 'not the password')
    expect(wrong.statusCode).toBe(401)
  })

  it('states the end of a timed suspension', async () => {
    const user = await accountWithPassword({ status: 'suspended' })
    await stack.db.db
      .update(users)
      .set({ suspendedUntil: new Date('2031-05-06T12:00:00Z') })
      .where(eq(users.id, user.id))
    const response = await login(user.email, PASSWORD)
    expect(JSON.stringify(response.json())).toContain('until 2031-05-06')
  })

  it('refuses a deleted account with the generic 401', async () => {
    const user = await accountWithPassword({ status: 'deleted' })
    const response = await login(user.email, PASSWORD)
    expect(response.statusCode).toBe(401)
    expect(response.cookies).toHaveLength(0)
  })

  it('returns 429 with Retry-After on the 6th attempt for one account', async () => {
    const user = await accountWithPassword()
    for (let i = 0; i < 5; i += 1) {
      // A different IP each time keeps the per-IP limit out of the way.
      expect((await login(user.email, 'wrong', `10.1.0.${i + 1}`)).statusCode).toBe(401)
    }
    const sixth = await login(user.email, PASSWORD, '10.1.0.9')
    expect(sixth.statusCode).toBe(429)
    expect(sixth.headers['retry-after']).toBeDefined()
  })

  it('returns 429 on the 11th attempt from one IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await login(`nobody${i}@example.test`, 'wrong', '10.2.0.1')).statusCode).toBe(401)
    }
    const eleventh = await login('nobody10@example.test', 'wrong', '10.2.0.1')
    expect(eleventh.statusCode).toBe(429)
  })

  it('rejects a body without a password', async () => {
    const response = await post('/v1/auth/login', { email: 'a@example.test' })
    expect(response.statusCode).toBe(400)
  })
})

describe('POST /v1/auth/logout and /logout-all', () => {
  it('logout ends only the current session', async () => {
    const user = await accountWithPassword()
    const first = cookieOf(await login(user.email, PASSWORD, '10.3.0.1'))
    const second = cookieOf(await login(user.email, PASSWORD, '10.3.0.2'))

    const response = await post('/v1/auth/logout', undefined, {
      cookies: { [SESSION_COOKIE]: first },
    })
    expect(response.statusCode).toBe(200)
    expect(await viewerFor(first)).toBeNull()
    expect((await viewerFor(second))?.id).toBe(user.id)
  })

  it('logout-all ends every session of the user and no one else’s', async () => {
    const user = await accountWithPassword()
    const other = await accountWithPassword()
    const first = cookieOf(await login(user.email, PASSWORD, '10.4.0.1'))
    const second = cookieOf(await login(user.email, PASSWORD, '10.4.0.2'))
    const others = cookieOf(await login(other.email, PASSWORD, '10.4.0.3'))

    const response = await post('/v1/auth/logout-all', undefined, {
      cookies: { [SESSION_COOKIE]: first },
    })
    expect(response.statusCode).toBe(200)
    expect(await viewerFor(first)).toBeNull()
    expect(await viewerFor(second)).toBeNull()
    expect((await viewerFor(others))?.id).toBe(other.id)
    expect(
      await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toHaveLength(0)
  })

  it('denies Visitors on both routes', async () => {
    expect((await post('/v1/auth/logout')).statusCode).toBe(401)
    expect((await post('/v1/auth/logout-all')).statusCode).toBe(401)
  })
})
