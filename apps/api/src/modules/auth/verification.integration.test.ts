import { authTokens, sessions, users } from '@reprint/db'
import { problemDetailsSchema, sessionResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import type { JobName, JobPayload } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from './session-cookie.js'
import { generateToken, hashToken } from './tokens.js'

const ORIGIN = 'http://www.reprint.test:5173'
const HOUR_MS = 60 * 60 * 1000

let stack: TestStack
let app: FastifyInstance
let enqueued: { name: JobName; payload: JobPayload<JobName> }[]

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
    PUBLIC_SIGNUPS: 'true',
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

/** Gives `userId` a verification token and returns the raw value a link would carry. */
async function issueToken(userId: string, expiresInMs = 24 * HOUR_MS) {
  const raw = generateToken()
  await stack.db.db.insert(authTokens).values({
    userId,
    tokenHash: hashToken(raw),
    purpose: 'verify_email',
    expiresAt: new Date(Date.now() + expiresInMs),
  })
  return raw
}

function verify(token: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/verify-email',
    headers: { origin: ORIGIN },
    payload: { token },
  })
}

function resend(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/resend-verification',
    headers: { origin: ORIGIN, ...headers },
    payload,
  })
}

async function verifiedAt(userId: string) {
  const [row] = await stack.db.db.select().from(users).where(eq(users.id, userId))
  return row?.emailVerifiedAt ?? null
}

describe('POST /v1/auth/verify-email', () => {
  it('verifies the account once, with a token that then stops working', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const token = await issueToken(user.id)

    const first = await verify(token)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual({ status: 'verified' })
    const stamp = await verifiedAt(user.id)
    expect(stamp).not.toBeNull()

    const again = await verify(token)
    expect(again.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(again.json()).errors?.[0]?.path).toBe('body.token')
    expect((await verifiedAt(user.id))?.getTime()).toBe(stamp?.getTime())
  })

  it('rejects a token older than 24 hours', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const token = await issueToken(user.id, -1000)
    const response = await verify(token)
    expect(response.statusCode).toBe(400)
    expect(await verifiedAt(user.id)).toBeNull()
  })

  it('rejects an unknown token and a token of another purpose', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    expect((await verify('not-a-real-token')).statusCode).toBe(400)

    const raw = generateToken()
    await stack.db.db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      purpose: 'reset_password',
      expiresAt: new Date(Date.now() + HOUR_MS),
    })
    expect((await verify(raw)).statusCode).toBe(400)
    expect(await verifiedAt(user.id)).toBeNull()
  })

  it('rejects a body without a token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      headers: { origin: ORIGIN },
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('POST /v1/auth/resend-verification', () => {
  it('sends a fresh link to an unverified account and retires the earlier one', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const oldToken = await issueToken(user.id)

    const response = await resend({ email: user.email })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'check_your_email' })

    expect(enqueued).toHaveLength(1)
    const payload = enqueued[0]?.payload as {
      template: string
      to: string
      props: { verifyUrl: string }
    }
    expect(payload).toMatchObject({ template: 'verify-email', to: user.email })
    const raw = new URL(payload.props.verifyUrl).searchParams.get('token') ?? ''

    expect((await verify(oldToken)).statusCode).toBe(400)
    expect((await verify(raw)).statusCode).toBe(200)
    expect(await verifiedAt(user.id)).not.toBeNull()
  })

  it('returns the same body and sends nothing for unknown and already-verified addresses', async () => {
    const verified = await createTestUser(stack.db.db)
    const known = await resend({ email: verified.email })
    const unknown = await resend({ email: 'nobody@example.test' })
    expect(known.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(200)
    expect(unknown.json()).toEqual(known.json())
    expect(enqueued).toHaveLength(0)
    expect(await stack.db.db.select().from(authTokens)).toHaveLength(0)
  })

  it('uses the session address for a signed-in Member who sends no email', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const cookie = await startSession(user.id)

    const response = await resend({}, { cookie: `${SESSION_COOKIE}=${cookie}` })
    expect(response.statusCode).toBe(200)
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.payload).toMatchObject({ to: user.email })
  })

  it('asks a Visitor who sends no email for one', async () => {
    const response = await resend({})
    expect(response.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(response.json()).errors?.[0]?.path).toBe('body.email')
  })

  it('allows 3 per hour per email and refuses the 4th, whatever the case or IP', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    for (let i = 0; i < 3; i++) {
      expect((await resend({ email: user.email })).statusCode).toBe(200)
    }
    const fourth = await resend({ email: user.email.toUpperCase() })
    expect(fourth.statusCode).toBe(429)
    expect(fourth.headers['retry-after']).toBeDefined()
    expect(enqueued).toHaveLength(3)
    // A different email is unaffected.
    expect((await resend({ email: 'other@example.test' })).statusCode).toBe(200)
  })
})

describe('GET /v1/auth/session', () => {
  it('returns viewer null for Visitors', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/auth/session' })
    expect(response.statusCode).toBe(200)
    expect(sessionResponseSchema.parse(response.json())).toEqual({
      signupsOpen: true,
      viewer: null,
    })
  })

  it('returns the viewer with verification state and permission names', async () => {
    const moderator = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const cookie = await startSession(moderator.id)
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
    const body = sessionResponseSchema.parse(response.json())
    expect(body.viewer).toMatchObject({
      id: moderator.id,
      username: moderator.username,
      displayName: moderator.displayName,
      verified: true,
    })
    expect(body.viewer?.permissions).toContain('reviews.moderate')
    expect(body.viewer?.permissions).toEqual([...(body.viewer?.permissions ?? [])].sort())
    expect(JSON.stringify(body)).not.toContain(moderator.email)
  })

  it('reports an unverified Member as not verified', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const cookie = await startSession(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
    })
    expect(sessionResponseSchema.parse(response.json()).viewer?.verified).toBe(false)
  })
})

/** Opens a real session row and returns the raw cookie token. */
async function startSession(userId: string): Promise<string> {
  const token = generateToken()
  await stack.db.db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + 24 * HOUR_MS),
    ip: '127.0.0.1',
    userAgent: 'test',
  })
  return token
}
