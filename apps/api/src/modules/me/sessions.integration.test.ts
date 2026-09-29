import { newId, sessions } from '@reprint/db'
import { problemDetailsSchema, sessionInfoSchema, sessionListResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'
import { deviceName } from './sessions.js'

const ORIGIN = 'http://www.reprint.test:5173'
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0'

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
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
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

/** Signs a user in from a device with the given user agent and returns the cookie. */
async function signIn(userId: string, userAgent = FIREFOX_MAC) {
  const started = await app.inject({
    method: 'GET',
    url: `/test/start/${userId}`,
    headers: { 'user-agent': userAgent },
  })
  const value = started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ''
  return { [SESSION_COOKIE]: value }
}

function call(method: 'GET' | 'DELETE', url: string, cookies?: Record<string, string>) {
  return app.inject({
    method,
    url,
    cookies,
    headers: method === 'GET' ? {} : { origin: ORIGIN },
  })
}

describe('deviceName', () => {
  it('reads browser and system, and falls back for missing or odd agents', () => {
    expect(deviceName(FIREFOX_MAC)).toBe('Firefox on macOS')
    expect(deviceName(null)).toBe('Unknown device')
    expect(deviceName('curl-ish')).toBe('Unknown device')
  })
})

describe('GET /v1/me/sessions', () => {
  it('lists active sessions with device, IP, last seen, and the current flag', async () => {
    const user = await createTestUser(stack.db.db)
    await signIn(user.id, 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile Safari/537.36')
    // Those sessions expire; only sessions made afterward, and the other Member's, are separate.
    await stack.db.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id))
    const fresh = await signIn(user.id)
    const other = await createTestUser(stack.db.db)
    await signIn(other.id)

    const response = await call('GET', '/v1/me/sessions', fresh)
    expect(response.statusCode).toBe(200)
    const { items } = sessionListResponseSchema.parse(response.json())
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ device: 'Firefox on macOS', current: true })
    expect(items[0]?.ip).toBeTruthy()
    expect(JSON.stringify(items)).not.toMatch(/token|hash/i)
  })

  it('marks only the calling session as current', async () => {
    const user = await createTestUser(stack.db.db)
    const first = await signIn(user.id)
    await signIn(user.id, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')
    const { items } = sessionListResponseSchema.parse(
      (await call('GET', '/v1/me/sessions', first)).json(),
    )
    expect(items).toHaveLength(2)
    expect(items.filter((item) => item.current)).toHaveLength(1)
    expect(items.find((item) => item.current)?.device).toBe('Firefox on macOS')
  })

  it('returns 401 Problem Details for a Visitor', async () => {
    const response = await call('GET', '/v1/me/sessions')
    expect(response.statusCode).toBe(401)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(401)
  })
})

describe('GET /v1/me/sessions/:id', () => {
  it('returns one of the Member’s sessions', async () => {
    const user = await createTestUser(stack.db.db)
    const cookies = await signIn(user.id)
    const [row] = await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id))
    const response = await call('GET', `/v1/me/sessions/${row?.id}`, cookies)
    expect(response.statusCode).toBe(200)
    expect(sessionInfoSchema.parse(response.json())).toMatchObject({ id: row?.id, current: true })
  })

  it('returns 404 for another Member’s session and for an unknown ID', async () => {
    const user = await createTestUser(stack.db.db)
    const other = await createTestUser(stack.db.db)
    await signIn(other.id)
    const cookies = await signIn(user.id)
    const [theirs] = await stack.db.db.select().from(sessions).where(eq(sessions.userId, other.id))
    expect((await call('GET', `/v1/me/sessions/${theirs?.id}`, cookies)).statusCode).toBe(404)
    expect((await call('GET', `/v1/me/sessions/${newId()}`, cookies)).statusCode).toBe(404)
  })

  it('returns 400 for a malformed ID and 401 for a Visitor', async () => {
    const user = await createTestUser(stack.db.db)
    const cookies = await signIn(user.id)
    expect((await call('GET', '/v1/me/sessions/nope', cookies)).statusCode).toBe(400)
    expect((await call('GET', `/v1/me/sessions/${newId()}`)).statusCode).toBe(401)
  })
})

describe('DELETE /v1/me/sessions/:id', () => {
  it('ends another device’s session and leaves this one signed in', async () => {
    const user = await createTestUser(stack.db.db)
    const other = await signIn(user.id)
    const mine = await signIn(user.id)
    const rows = await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id))
    const { items } = sessionListResponseSchema.parse(
      (await call('GET', '/v1/me/sessions', mine)).json(),
    )
    const target = items.find((item) => !item.current)
    expect(rows).toHaveLength(2)

    const response = await call('DELETE', `/v1/me/sessions/${target?.id}`, mine)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'session_ended' })
    expect((await call('GET', '/v1/me/sessions', other)).statusCode).toBe(401)
    expect((await call('GET', '/v1/me/sessions', mine)).statusCode).toBe(200)
  })

  it('ends the current session and clears the cookie', async () => {
    const user = await createTestUser(stack.db.db)
    const mine = await signIn(user.id)
    const [row] = await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id))
    const response = await call('DELETE', `/v1/me/sessions/${row?.id}`, mine)
    expect(response.statusCode).toBe(200)
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('')
    expect((await call('GET', '/v1/me/sessions', mine)).statusCode).toBe(401)
  })

  it('returns 404 for another Member’s session and does not end it', async () => {
    const user = await createTestUser(stack.db.db)
    const other = await createTestUser(stack.db.db)
    const theirs = await signIn(other.id)
    const cookies = await signIn(user.id)
    const [row] = await stack.db.db.select().from(sessions).where(eq(sessions.userId, other.id))
    const response = await call('DELETE', `/v1/me/sessions/${row?.id}`, cookies)
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(404)
    expect((await call('GET', '/v1/me/sessions', theirs)).statusCode).toBe(200)
  })

  it('returns 401 for a Visitor', async () => {
    const response = await call('DELETE', `/v1/me/sessions/${newId()}`)
    expect(response.statusCode).toBe(401)
  })
})
