import { authTokens, sessions, users } from '@reprint/db'
import { problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import type { JobName, JobPayload } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword, verifyPassword } from './password.js'
import { generateToken, hashToken } from './tokens.js'

const ORIGIN = 'http://www.reprint.test:5173'
const HOUR_MS = 60 * 60 * 1000
const OLD_PASSWORD = 'correct horse battery staple'
const NEW_PASSWORD = 'a brand new long passphrase'

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

function post(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url, headers: { origin: ORIGIN }, payload })
}

async function accountWithPassword(options: Parameters<typeof createTestUser>[1] = {}) {
  const user = await createTestUser(stack.db.db, options)
  await stack.db.db
    .update(users)
    .set({ passwordHash: await hashPassword(OLD_PASSWORD) })
    .where(eq(users.id, user.id))
  return user
}

async function issueToken(userId: string, expiresInMs = HOUR_MS) {
  const raw = generateToken()
  await stack.db.db.insert(authTokens).values({
    userId,
    tokenHash: hashToken(raw),
    purpose: 'reset_password',
    expiresAt: new Date(Date.now() + expiresInMs),
  })
  return raw
}

async function storedHash(userId: string) {
  const [row] = await stack.db.db.select().from(users).where(eq(users.id, userId))
  return row?.passwordHash ?? ''
}

describe('POST /v1/auth/forgot-password', () => {
  it('answers identically for known and unknown emails, and only emails known ones', async () => {
    const user = await createTestUser(stack.db.db)
    const known = await post('/v1/auth/forgot-password', { email: user.email })
    const unknown = await post('/v1/auth/forgot-password', { email: 'nobody@example.test' })
    expect(known.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(200)
    expect(known.json()).toEqual(unknown.json())
    expect(known.json()).toEqual({ status: 'check_your_email' })

    expect(enqueued).toHaveLength(1)
    const job = enqueued[0]
    expect(job?.name).toBe('email.send')
    const payload = job?.payload as { template: string; to: string; props: { resetUrl: string } }
    expect(payload.template).toBe('password-reset')
    expect(payload.to).toBe(user.email)

    const token = new URL(payload.props.resetUrl).searchParams.get('token') ?? ''
    const [row] = await stack.db.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, hashToken(token)))
    expect(row?.purpose).toBe('reset_password')
    const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now()
    expect(ttl).toBeGreaterThan(HOUR_MS - 60_000)
    expect(ttl).toBeLessThanOrEqual(HOUR_MS)
  })

  it('sends nothing for a suspended account', async () => {
    const user = await createTestUser(stack.db.db, { status: 'suspended' })
    expect((await post('/v1/auth/forgot-password', { email: user.email })).statusCode).toBe(200)
    expect(enqueued).toHaveLength(0)
  })

  it('returns 429 on the 4th request for one email within an hour', async () => {
    const email = 'limited@example.test'
    for (let i = 0; i < 3; i++) {
      expect((await post('/v1/auth/forgot-password', { email })).statusCode).toBe(200)
    }
    const blocked = await post('/v1/auth/forgot-password', { email })
    expect(blocked.statusCode).toBe(429)
    expect(problemDetailsSchema.parse(blocked.json()).status).toBe(429)
  })

  it('rejects an invalid email', async () => {
    expect((await post('/v1/auth/forgot-password', { email: 'nope' })).statusCode).toBe(400)
  })
})

describe('POST /v1/auth/reset-password', () => {
  it('sets a new Argon2id hash, ends all sessions, and sends the password changed email', async () => {
    const user = await accountWithPassword()
    for (const tokenHash of ['a', 'b']) {
      await stack.db.db.insert(sessions).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + HOUR_MS),
      })
    }
    const token = await issueToken(user.id)

    const response = await post('/v1/auth/reset-password', { token, password: NEW_PASSWORD })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'password_reset' })

    const hash = await storedHash(user.id)
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(hash, NEW_PASSWORD)).toBe(true)
    expect(await verifyPassword(hash, OLD_PASSWORD)).toBe(false)
    expect(
      await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id)),
    ).toHaveLength(0)

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.payload).toMatchObject({ template: 'password-changed', to: user.email })

    const login = await post('/v1/auth/login', { email: user.email, password: NEW_PASSWORD })
    expect(login.statusCode).toBe(200)
  })

  it('rejects a reused token', async () => {
    const user = await accountWithPassword()
    const token = await issueToken(user.id)
    expect(
      (await post('/v1/auth/reset-password', { token, password: NEW_PASSWORD })).statusCode,
    ).toBe(200)
    const again = await post('/v1/auth/reset-password', {
      token,
      password: 'yet another long passphrase',
    })
    expect(again.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(again.json()).errors?.[0]?.path).toBe('body.token')
    expect(await verifyPassword(await storedHash(user.id), NEW_PASSWORD)).toBe(true)
  })

  it('rejects an expired token, an unknown token, and a token of another purpose', async () => {
    const user = await accountWithPassword()
    const expired = await issueToken(user.id, -1000)
    expect(
      (await post('/v1/auth/reset-password', { token: expired, password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(400)
    expect(
      (await post('/v1/auth/reset-password', { token: 'made-up', password: NEW_PASSWORD }))
        .statusCode,
    ).toBe(400)

    const raw = generateToken()
    await stack.db.db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      purpose: 'verify_email',
      expiresAt: new Date(Date.now() + HOUR_MS),
    })
    expect(
      (await post('/v1/auth/reset-password', { token: raw, password: NEW_PASSWORD })).statusCode,
    ).toBe(400)
    expect(await verifyPassword(await storedHash(user.id), OLD_PASSWORD)).toBe(true)
    expect(enqueued).toHaveLength(0)
  })

  it('rejects a short password without consuming the token', async () => {
    const user = await accountWithPassword()
    const token = await issueToken(user.id)
    expect((await post('/v1/auth/reset-password', { token, password: 'short' })).statusCode).toBe(
      400,
    )
    expect(
      (await post('/v1/auth/reset-password', { token, password: NEW_PASSWORD })).statusCode,
    ).toBe(200)
  })

  it('does not reset a suspended account', async () => {
    const user = await accountWithPassword({ status: 'suspended' })
    const token = await issueToken(user.id)
    expect(
      (await post('/v1/auth/reset-password', { token, password: NEW_PASSWORD })).statusCode,
    ).toBe(400)
    expect(await verifyPassword(await storedHash(user.id), OLD_PASSWORD)).toBe(true)
  })
})
