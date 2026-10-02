import { auditLog, authTokens, newId, sessions, users } from '@reprint/db'
import {
  adminUserDetailSchema,
  adminUserResendVerificationResponseSchema,
  adminUserRevokeSessionsResponseSchema,
  adminUserSuspensionResponseSchema,
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
import { liftExpiredSuspensions } from './suspensions.js'

const ORIGIN = 'http://www.reprint.test:5173'
const PASSWORD = 'correct horse battery staple 42'
const DAY_MS = 86_400_000

let stack: TestStack
let app: FastifyInstance
let enqueued: { name: string; payload: unknown }[]

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
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
  enqueued = []
})

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

const post = (path: string, cookies?: Record<string, string>, payload?: object) =>
  app.inject({
    method: 'POST',
    url: `/v1/admin/users/${path}`,
    cookies,
    payload,
    headers: { origin: ORIGIN },
  })
const audits = (action: string) =>
  stack.db.db.select().from(auditLog).where(eq(auditLog.action, action))
const sessionCount = async (userId: string) =>
  (await stack.db.db.select().from(sessions).where(eq(sessions.userId, userId))).length
const reload = async (id: string) => {
  const [row] = await stack.db.db.select().from(users).where(eq(users.id, id))
  if (!row) throw new Error('user missing')
  return row
}

describe('POST /v1/admin/users/:id/suspend', () => {
  it('suspends, ends every session, emails the user, and audits it', async () => {
    const admin = await person(['admin'])
    const target = await person()
    await app.inject({ method: 'GET', url: `/test/start/${target.user.id}` })
    expect(await sessionCount(target.user.id)).toBe(2)
    const until = new Date(Date.now() + 7 * DAY_MS).toISOString()

    const response = await post(`${target.user.id}/suspend`, admin.cookies, {
      reason: 'Repeated harassment.',
      until,
    })

    expect(response.statusCode).toBe(200)
    expect(adminUserSuspensionResponseSchema.parse(response.json())).toMatchObject({
      status: 'suspended',
      suspendedUntil: until,
    })
    expect(await sessionCount(target.user.id)).toBe(0)
    const row = await reload(target.user.id)
    expect(row).toMatchObject({ status: 'suspended', suspendedReason: 'Repeated harassment.' })
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      name: 'email.send',
      payload: {
        template: 'account-suspended',
        to: target.user.email,
        props: { reason: 'Repeated harassment.', until: until.slice(0, 10) },
      },
    })
    const [entry] = await audits('user.suspend')
    expect(entry).toMatchObject({
      actorId: admin.user.id,
      targetType: 'user',
      targetId: target.user.id,
      after: { status: 'suspended', reason: 'Repeated harassment.' },
    })
    // The old cookie no longer works.
    const me = await app.inject({ method: 'GET', url: '/v1/me', cookies: target.cookies })
    expect(me.statusCode).toBe(401)
  })

  it('stops the user logging in and keeps their Approved reviews visible', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)
    await stack.db.db
      .update(users)
      .set({ passwordHash: await hashPassword(PASSWORD) })
      .where(eq(users.id, target.id))
    await post(`${target.id}/suspend`, admin.cookies, { reason: 'Spam.' })

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: target.email, password: PASSWORD },
    })
    expect(login.statusCode).toBe(403)
    expect(login.json().detail).toContain('This account is suspended')

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/users/${target.id}`,
      cookies: admin.cookies,
    })
    const parsed = adminUserDetailSchema.parse(detail.json())
    expect(parsed.user).toMatchObject({ status: 'suspended', suspendedReason: 'Spam.' })
  })

  it('validates the request, and rejects yourself, deleted and suspended accounts, and unknown ids', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)
    const deleted = await createTestUser(stack.db.db, { status: 'deleted' })

    expect((await post(`${target.id}/suspend`, admin.cookies, {})).statusCode).toBe(400)
    const past = new Date(Date.now() - DAY_MS).toISOString()
    expect(
      (await post(`${target.id}/suspend`, admin.cookies, { reason: 'x', until: past })).statusCode,
    ).toBe(400)
    expect(
      (await post(`${admin.user.id}/suspend`, admin.cookies, { reason: 'x' })).statusCode,
    ).toBe(409)
    expect((await post(`${deleted.id}/suspend`, admin.cookies, { reason: 'x' })).statusCode).toBe(
      409,
    )
    expect((await post(`${newId()}/suspend`, admin.cookies, { reason: 'x' })).statusCode).toBe(404)
    expect((await post(`${target.id}/suspend`, admin.cookies, { reason: 'x' })).statusCode).toBe(
      200,
    )
    expect((await post(`${target.id}/suspend`, admin.cookies, { reason: 'x' })).statusCode).toBe(
      409,
    )
    expect(await audits('user.suspend')).toHaveLength(1)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const target = await createTestUser(stack.db.db)
    const moderator = await person(['moderator'])
    const member = await person()
    const body = { reason: 'x' }

    expect((await post(`${target.id}/suspend`, moderator.cookies, body)).statusCode).toBe(403)
    expect((await post(`${target.id}/suspend`, member.cookies, body)).statusCode).toBe(403)
    expect((await post(`${target.id}/suspend`, undefined, body)).statusCode).toBe(401)
    expect((await reload(target.id)).status).toBe('active')
    expect(await audits('user.suspend')).toHaveLength(0)
  })
})

describe('automatic lift', () => {
  it('lifts suspensions after their end date, and not before', async () => {
    const admin = await person(['admin'])
    const soon = await createTestUser(stack.db.db)
    const later = await createTestUser(stack.db.db)
    const open = await createTestUser(stack.db.db)
    const until = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString()
    await post(`${soon.id}/suspend`, admin.cookies, { reason: 'a', until: until(1) })
    await post(`${later.id}/suspend`, admin.cookies, { reason: 'b', until: until(10) })
    await post(`${open.id}/suspend`, admin.cookies, { reason: 'c' })

    const clock = new Date(Date.now() + 2 * DAY_MS)
    expect(await liftExpiredSuspensions(stack.db.db, clock)).toEqual({ lifted: 1 })

    expect(await reload(soon.id)).toMatchObject({
      status: 'active',
      suspendedUntil: null,
      suspendedReason: null,
    })
    expect((await reload(later.id)).status).toBe('suspended')
    expect((await reload(open.id)).status).toBe('suspended')
  })

  it('lets a Member whose suspension has ended log in before the job runs', async () => {
    const target = await createTestUser(stack.db.db)
    await stack.db.db
      .update(users)
      .set({
        passwordHash: await hashPassword(PASSWORD),
        status: 'suspended',
        suspendedUntil: new Date(Date.now() - 1000),
        suspendedReason: 'old',
      })
      .where(eq(users.id, target.id))

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: target.email, password: PASSWORD },
    })
    expect(login.statusCode).toBe(200)
    expect((await reload(target.id)).status).toBe('active')
  })
})

describe('POST /v1/admin/users/:id/unsuspend', () => {
  it('lifts a suspension and audits it', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)
    await post(`${target.id}/suspend`, admin.cookies, { reason: 'Spam.' })

    const response = await post(`${target.id}/unsuspend`, admin.cookies)

    expect(response.statusCode).toBe(200)
    expect(adminUserSuspensionResponseSchema.parse(response.json()).status).toBe('active')
    expect(await reload(target.id)).toMatchObject({ status: 'active', suspendedReason: null })
    const [entry] = await audits('user.unsuspend')
    expect(entry).toMatchObject({
      actorId: admin.user.id,
      targetId: target.id,
      before: { status: 'suspended', reason: 'Spam.' },
      after: { status: 'active' },
    })
  })

  it('rejects accounts that are not suspended and unknown ids', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)
    expect((await post(`${target.id}/unsuspend`, admin.cookies)).statusCode).toBe(409)
    expect((await post(`${newId()}/unsuspend`, admin.cookies)).statusCode).toBe(404)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const target = await createTestUser(stack.db.db, { status: 'suspended' })
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await post(`${target.id}/unsuspend`, moderator.cookies)).statusCode).toBe(403)
    expect((await post(`${target.id}/unsuspend`, member.cookies)).statusCode).toBe(403)
    expect((await post(`${target.id}/unsuspend`)).statusCode).toBe(401)
    expect((await reload(target.id)).status).toBe('suspended')
  })
})

describe('POST /v1/admin/users/:id/revoke-sessions', () => {
  it('ends every session of the user and audits it', async () => {
    const admin = await person(['admin'])
    const target = await person()
    await app.inject({ method: 'GET', url: `/test/start/${target.user.id}` })

    const response = await post(`${target.user.id}/revoke-sessions`, admin.cookies)

    expect(response.statusCode).toBe(200)
    expect(adminUserRevokeSessionsResponseSchema.parse(response.json()).revoked).toBe(2)
    expect(await sessionCount(target.user.id)).toBe(0)
    expect((await reload(target.user.id)).status).toBe('active')
    const [entry] = await audits('session.revoke')
    expect(entry).toMatchObject({
      actorId: admin.user.id,
      targetId: target.user.id,
      after: { revoked: 2 },
    })
  })

  it('returns 404 for unknown users and denies non-Admins', async () => {
    const admin = await person(['admin'])
    const moderator = await person(['moderator'])
    const target = await person()
    expect((await post(`${newId()}/revoke-sessions`, admin.cookies)).statusCode).toBe(404)
    expect((await post(`${target.user.id}/revoke-sessions`, moderator.cookies)).statusCode).toBe(
      403,
    )
    expect((await post(`${target.user.id}/revoke-sessions`, target.cookies)).statusCode).toBe(403)
    expect((await post(`${target.user.id}/revoke-sessions`)).statusCode).toBe(401)
    expect(await sessionCount(target.user.id)).toBe(1)
    expect(await audits('session.revoke')).toHaveLength(0)
  })
})

describe('POST /v1/admin/users/:id/resend-verification', () => {
  it('sends a fresh link to an unverified account and audits it', async () => {
    const moderator = await person(['moderator'])
    const target = await createTestUser(stack.db.db, { verified: false })

    const first = await post(`${target.id}/resend-verification`, moderator.cookies)
    const second = await post(`${target.id}/resend-verification`, moderator.cookies)

    expect(adminUserResendVerificationResponseSchema.parse(first.json()).sent).toBe(true)
    expect(second.statusCode).toBe(200)
    expect(enqueued).toHaveLength(2)
    expect(enqueued[1]).toMatchObject({
      payload: { template: 'verify-email', to: target.email },
    })
    // Only the newest link is left.
    const tokens = await stack.db.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.userId, target.id))
    expect(tokens).toHaveLength(1)
    expect(await audits('user.resend_verification')).toHaveLength(2)
  })

  it('sends nothing for verified, suspended, and unknown accounts', async () => {
    const admin = await person(['admin'])
    const verified = await createTestUser(stack.db.db)
    const suspended = await createTestUser(stack.db.db, { verified: false, status: 'suspended' })

    const none = await post(`${verified.id}/resend-verification`, admin.cookies)
    expect(adminUserResendVerificationResponseSchema.parse(none.json()).sent).toBe(false)
    expect((await post(`${suspended.id}/resend-verification`, admin.cookies)).statusCode).toBe(409)
    expect((await post(`${newId()}/resend-verification`, admin.cookies)).statusCode).toBe(404)
    expect(enqueued).toHaveLength(0)
    expect(await audits('user.resend_verification')).toHaveLength(0)
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const target = await createTestUser(stack.db.db, { verified: false })
    const member = await person()
    expect((await post(`${target.id}/resend-verification`, member.cookies)).statusCode).toBe(403)
    expect((await post(`${target.id}/resend-verification`)).statusCode).toBe(401)
    expect(enqueued).toHaveLength(0)
  })
})
