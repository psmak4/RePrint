import { sessions, users } from '@reprint/db'
import { meSchema, problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import type { JobName, JobPayload } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
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
  enqueued.length = 0
})

/** Creates a Member with a known password and returns them with a session cookie. */
async function signedInMember() {
  const user = await createTestUser(stack.db.db)
  await stack.db.db
    .update(users)
    .set({ passwordHash: await hashPassword(OLD_PASSWORD) })
    .where(eq(users.id, user.id))
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookie = started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ''
  return { user, cookies: { [SESSION_COOKIE]: cookie } }
}

function call(
  method: 'GET' | 'PATCH' | 'POST',
  url: string,
  cookies?: Record<string, string>,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    cookies,
    headers: method === 'GET' ? {} : { origin: ORIGIN },
    payload,
  })
}

describe('GET /v1/me', () => {
  it('returns the signed-in Member’s own account', async () => {
    const { user, cookies } = await signedInMember()
    const response = await call('GET', '/v1/me', cookies)
    expect(response.statusCode).toBe(200)
    const me = meSchema.parse(response.json())
    expect(me).toMatchObject({
      id: user.id,
      email: user.email,
      username: user.username,
      bio: null,
      verified: true,
      libraryPublic: true,
      emailReviewDecisions: true,
    })
    expect(JSON.stringify(me)).not.toContain('password')
  })

  it('returns 401 Problem Details for a Visitor', async () => {
    const response = await call('GET', '/v1/me')
    expect(response.statusCode).toBe(401)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(401)
  })
})

describe('PATCH /v1/me', () => {
  it('updates display name, bio, library privacy, and email preferences', async () => {
    const { user, cookies } = await signedInMember()
    const response = await call('PATCH', '/v1/me', cookies, {
      displayName: '  Ada L.  ',
      bio: 'Reads everything.',
      libraryPublic: false,
      emailReviewDecisions: false,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      displayName: 'Ada L.',
      bio: 'Reads everything.',
      libraryPublic: false,
      emailReviewDecisions: false,
    })
    const [row] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(row).toMatchObject({ displayName: 'Ada L.', libraryPublic: false })
  })

  it('changes only the fields sent and can clear the bio', async () => {
    const { cookies } = await signedInMember()
    await call('PATCH', '/v1/me', cookies, { bio: 'Hello' })
    const cleared = await call('PATCH', '/v1/me', cookies, { bio: '' })
    expect(cleared.json()).toMatchObject({ bio: null, libraryPublic: true })
  })

  it('returns 400 with field errors for invalid input', async () => {
    const { cookies } = await signedInMember()
    for (const body of [
      { bio: 'x'.repeat(281) },
      { displayName: '   ' },
      { username: 'renamed' },
      {},
    ]) {
      const response = await call('PATCH', '/v1/me', cookies, body)
      expect(response.statusCode).toBe(400)
      expect(problemDetailsSchema.parse(response.json()).errors?.length).toBeGreaterThan(0)
    }
  })

  it('returns 401 for a Visitor', async () => {
    expect((await call('PATCH', '/v1/me', undefined, { bio: 'x' })).statusCode).toBe(401)
  })
})

describe('POST /v1/me/password', () => {
  it('sets a new Argon2id hash, keeps this session, ends the others, and sends the email', async () => {
    const { user, cookies } = await signedInMember()
    await stack.db.db
      .insert(sessions)
      .values({ userId: user.id, tokenHash: 'other-device', expiresAt: new Date(Date.now() + 1e9) })

    const response = await call('POST', '/v1/me/password', cookies, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'password_changed' })

    const [row] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassword(row?.passwordHash ?? '', NEW_PASSWORD)).toBe(true)

    const remaining = await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id))
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.tokenHash).not.toBe('other-device')
    expect((await call('GET', '/v1/me', cookies)).statusCode).toBe(200)

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.name).toBe('email.send')
    expect(enqueued[0]?.payload).toMatchObject({ template: 'password-changed', to: user.email })
  })

  it('refuses a wrong current password and changes nothing', async () => {
    const { user, cookies } = await signedInMember()
    const response = await call('POST', '/v1/me/password', cookies, {
      currentPassword: 'not the password',
      newPassword: NEW_PASSWORD,
    })
    expect(response.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(response.json()).errors?.[0]?.path).toBe(
      'body.currentPassword',
    )
    const [row] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(await verifyPassword(row?.passwordHash ?? '', OLD_PASSWORD)).toBe(true)
    expect(enqueued).toHaveLength(0)
  })

  it('rejects a new password that is too short', async () => {
    const { cookies } = await signedInMember()
    const response = await call('POST', '/v1/me/password', cookies, {
      currentPassword: OLD_PASSWORD,
      newPassword: 'short',
    })
    expect(response.statusCode).toBe(400)
  })

  it('returns 401 for a Visitor', async () => {
    const response = await call('POST', '/v1/me/password', undefined, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    })
    expect(response.statusCode).toBe(401)
  })

  it('returns 429 after 5 attempts in 15 minutes', async () => {
    const { cookies } = await signedInMember()
    for (let i = 0; i < 5; i++) {
      const wrong = await call('POST', '/v1/me/password', cookies, {
        currentPassword: 'wrong',
        newPassword: NEW_PASSWORD,
      })
      expect(wrong.statusCode).toBe(400)
    }
    const blocked = await call('POST', '/v1/me/password', cookies, {
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    })
    expect(blocked.statusCode).toBe(429)
  })
})
