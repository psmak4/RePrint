import { authTokens, notifications, users } from '@reprint/db'
import {
  markNotificationsReadResponseSchema,
  notificationListResponseSchema,
  problemDetailsSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword } from '../auth/password.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'
import { generateToken, hashToken } from '../auth/tokens.js'
import { notify } from './notify.js'

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

async function signedInMember() {
  const user = await createTestUser(stack.db.db)
  await stack.db.db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, user.id))
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookie = started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? ''
  return { user, cookies: { [SESSION_COOKIE]: cookie } }
}

function post(url: string, payload: Record<string, unknown>, cookies?: Record<string, string>) {
  return app.inject({ method: 'POST', url, cookies, headers: { origin: ORIGIN }, payload })
}

async function typesFor(userId: string): Promise<string[]> {
  const rows = await stack.db.db
    .select({ type: notifications.type })
    .from(notifications)
    .where(eq(notifications.userId, userId))
  return rows.map((r) => r.type)
}

describe('notify', () => {
  it('creates an unread notification with its data', async () => {
    const user = await createTestUser(stack.db.db)
    await notify(stack.db.db, user.id, 'review_approved', { bookTitle: 'Dune' })
    const [row] = await stack.db.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
    expect(row).toMatchObject({
      type: 'review_approved',
      data: { bookTitle: 'Dune' },
      readAt: null,
    })
  })

  it('rolls back with the caller transaction', async () => {
    const user = await createTestUser(stack.db.db)
    await stack.db.db
      .transaction(async (tx) => {
        await notify(tx, user.id, 'password_changed')
        throw new Error('abort')
      })
      .catch(() => undefined)
    expect(await typesFor(user.id)).toEqual([])
  })
})

describe('security notifications', () => {
  it('a password change notifies the Member', async () => {
    const { user, cookies } = await signedInMember()
    const response = await post(
      '/v1/me/password',
      { currentPassword: PASSWORD, newPassword: 'a brand new long passphrase' },
      cookies,
    )
    expect(response.statusCode).toBe(200)
    expect(await typesFor(user.id)).toEqual(['password_changed'])
  })

  it('a password reset notifies the Member', async () => {
    const user = await createTestUser(stack.db.db)
    const token = generateToken()
    await stack.db.db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: 'reset_password',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const response = await post('/v1/auth/reset-password', {
      token,
      password: 'a brand new long passphrase',
    })
    expect(response.statusCode).toBe(200)
    expect(await typesFor(user.id)).toEqual(['password_changed'])
  })

  it('a confirmed email change notifies the Member', async () => {
    const user = await createTestUser(stack.db.db)
    const token = generateToken()
    await stack.db.db.insert(authTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: 'change_email',
      newEmail: 'moved@example.test',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const response = await post('/v1/me/email/confirm', { token })
    expect(response.statusCode).toBe(200)
    expect(await typesFor(user.id)).toEqual(['email_changed'])
  })
})

describe('GET /v1/me/notifications', () => {
  it('lists the viewer’s notifications newest first with the unread count and paging', async () => {
    const { user, cookies } = await signedInMember()
    const other = await createTestUser(stack.db.db)
    await stack.db.db.insert(notifications).values([
      { userId: user.id, type: 'password_changed', createdAt: new Date('2026-01-01T00:00:00Z') },
      {
        userId: user.id,
        type: 'email_changed',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        readAt: new Date('2026-01-03T00:00:00Z'),
      },
      { userId: user.id, type: 'review_approved', createdAt: new Date('2026-01-04T00:00:00Z') },
      { userId: other.id, type: 'review_rejected' },
    ])

    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications', cookies })
    expect(response.statusCode).toBe(200)
    const body = notificationListResponseSchema.parse(response.json())
    expect(body.items.map((n) => n.type)).toEqual([
      'review_approved',
      'email_changed',
      'password_changed',
    ])
    expect(body.items.map((n) => n.read)).toEqual([false, true, false])
    expect(body.unreadCount).toBe(2)
    expect(body.meta.total).toBe(3)

    const second = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?page=2&pageSize=2',
      cookies,
    })
    const page = notificationListResponseSchema.parse(second.json())
    expect(page.items.map((n) => n.type)).toEqual(['password_changed'])
    expect(page.unreadCount).toBe(2)
  })

  it('refuses Visitors', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications' })
    expect(response.statusCode).toBe(401)
    expect(problemDetailsSchema.safeParse(response.json()).success).toBe(true)
  })
})

describe('POST /v1/me/notifications/read', () => {
  async function seed(userId: string) {
    return stack.db.db
      .insert(notifications)
      .values([
        { userId, type: 'password_changed' },
        { userId, type: 'email_changed' },
        { userId, type: 'review_approved' },
      ])
      .returning({ id: notifications.id })
  }

  it('marks the given notifications read and reports what is still unread', async () => {
    const { user, cookies } = await signedInMember()
    const rows = await seed(user.id)
    const response = await post(
      '/v1/me/notifications/read',
      { ids: rows.slice(0, 2).map((r) => r.id) },
      cookies,
    )
    expect(response.statusCode).toBe(200)
    expect(markNotificationsReadResponseSchema.parse(response.json())).toEqual({ unreadCount: 1 })
  })

  it('marks everything read with all', async () => {
    const { user, cookies } = await signedInMember()
    await seed(user.id)
    const response = await post('/v1/me/notifications/read', { all: true }, cookies)
    expect(markNotificationsReadResponseSchema.parse(response.json())).toEqual({ unreadCount: 0 })
  })

  it('ignores another Member’s notification IDs', async () => {
    const { cookies } = await signedInMember()
    const other = await createTestUser(stack.db.db)
    const rows = await seed(other.id)
    const response = await post(
      '/v1/me/notifications/read',
      { ids: rows.map((r) => r.id) },
      cookies,
    )
    expect(response.statusCode).toBe(200)
    const unread = await stack.db.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, other.id))
    expect(unread.every((n) => n.readAt === null)).toBe(true)
  })

  it('rejects an empty body and refuses Visitors', async () => {
    const { cookies } = await signedInMember()
    expect((await post('/v1/me/notifications/read', {}, cookies)).statusCode).toBe(400)
    expect((await post('/v1/me/notifications/read', { all: true })).statusCode).toBe(401)
  })
})
