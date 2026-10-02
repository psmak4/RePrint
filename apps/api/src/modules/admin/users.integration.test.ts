import { auditLog, books, newId, reviewReports, reviews, sessions, users } from '@reprint/db'
import {
  adminUserDetailSchema,
  adminUserRolesResponseSchema,
  adminUsersResponseSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const BODY = 'A thoughtful review that is comfortably longer than fifty characters.'

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

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

const list = (cookies?: Record<string, string>, query = '') =>
  app.inject({ method: 'GET', url: `/v1/admin/users${query}`, cookies })
const detail = (id: string, cookies?: Record<string, string>) =>
  app.inject({ method: 'GET', url: `/v1/admin/users/${id}`, cookies })

async function review(userId: string, status: 'approved' | 'pending' = 'approved') {
  const bookId = newId()
  await stack.db.db
    .insert(books)
    .values({ id: bookId, slug: `book-${bookId.slice(-8)}`, title: 'A Book' })
  const [row] = await stack.db.db
    .insert(reviews)
    .values({ userId, bookId, rating: 4, body: BODY, status })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

describe('GET /v1/admin/users', () => {
  it('lists users newest first with roles and counts for Admins', async () => {
    const admin = await person(['admin'])
    const reader = await createTestUser(stack.db.db)
    const approved = await review(reader.id)
    await review(reader.id, 'pending')
    const reporter = await createTestUser(stack.db.db)
    await stack.db.db
      .insert(reviewReports)
      .values({ reviewId: approved.id, reporterId: reporter.id, reason: 'spam' })

    const response = await list(admin.cookies)
    expect(response.statusCode).toBe(200)
    const body = adminUsersResponseSchema.parse(response.json())
    expect(body.items.map((item) => item.id)).toEqual([reporter.id, reader.id, admin.user.id])
    const found = body.items.find((item) => item.id === reader.id)
    expect(found).toMatchObject({
      email: reader.email,
      status: 'active',
      roles: ['member'],
      reviewCount: 1,
      reportsReceived: 1,
    })
    expect(body.items.find((item) => item.id === admin.user.id)?.roles).toEqual(['admin'])
  })

  it('searches by email or username and filters by role, status, and join date', async () => {
    const admin = await person(['admin'])
    const mod = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const unverified = await createTestUser(stack.db.db, { verified: false })
    const suspended = await createTestUser(stack.db.db, { status: 'suspended' })
    const deleted = await createTestUser(stack.db.db, { status: 'deleted' })
    const old = await createTestUser(stack.db.db)
    await stack.db.db
      .update(users)
      .set({ createdAt: new Date('2020-03-15T12:00:00Z') })
      .where(eq(users.id, old.id))
    const ids = async (query: string) =>
      adminUsersResponseSchema
        .parse((await list(admin.cookies, query)).json())
        .items.map((i) => i.id)

    expect(await ids(`?q=${encodeURIComponent(mod.email)}`)).toEqual([mod.id])
    expect(await ids(`?q=${mod.username.slice(0, 10).toUpperCase()}`)).toContain(mod.id)
    expect(await ids('?role=moderator')).toEqual([mod.id])
    expect(await ids('?status=unverified')).toEqual([unverified.id])
    expect(await ids('?status=suspended')).toEqual([suspended.id])
    expect(await ids('?status=deleted')).toEqual([deleted.id])
    expect(await ids('?status=active')).not.toContain(unverified.id)
    expect(await ids('?joinedFrom=2020-03-15&joinedTo=2020-03-15')).toEqual([old.id])
    expect(await ids('?joinedTo=2020-03-14')).toEqual([])
    // A search for "%" matches a literal percent sign, not everything.
    expect(await ids('?q=%25')).toEqual([])
  })

  it('pages with a cursor and rejects a malformed one', async () => {
    const admin = await person(['admin'])
    const a = await createTestUser(stack.db.db)
    const b = await createTestUser(stack.db.db)
    const first = adminUsersResponseSchema.parse((await list(admin.cookies, '?limit=2')).json())
    expect(first.items.map((item) => item.id)).toEqual([b.id, a.id])
    expect(first.meta.nextCursor).not.toBeNull()
    const second = adminUsersResponseSchema.parse(
      (await list(admin.cookies, `?limit=2&cursor=${first.meta.nextCursor}`)).json(),
    )
    expect(second.items.map((item) => item.id)).toEqual([admin.user.id])
    expect(second.meta.nextCursor).toBeNull()
    expect((await list(admin.cookies, '?cursor=nope')).statusCode).toBe(400)
  })

  it('gives Moderators the limited view: no email, and no search by email', async () => {
    const mod = await person(['moderator'])
    const reader = await createTestUser(stack.db.db)
    const response = adminUsersResponseSchema.parse((await list(mod.cookies)).json())
    expect(response.items.length).toBe(2)
    expect(response.items.every((item) => item.email === null)).toBe(true)
    const byEmail = adminUsersResponseSchema.parse(
      (await list(mod.cookies, `?q=${encodeURIComponent(reader.email)}`)).json(),
    )
    expect(byEmail.items).toEqual([])
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    expect((await list(member.cookies)).statusCode).toBe(403)
    expect((await list()).statusCode).toBe(401)
  })
})

describe('GET /v1/admin/users/:id', () => {
  it('returns the full detail to Admins', async () => {
    const admin = await person(['admin'])
    const target = await person()
    const approved = await review(target.user.id)
    await review(target.user.id, 'pending')
    const reporter = await createTestUser(stack.db.db)
    await stack.db.db
      .insert(reviewReports)
      .values({ reviewId: approved.id, reporterId: reporter.id, reason: 'spam' })
    const other = await review(reporter.id)
    await stack.db.db
      .insert(reviewReports)
      .values({ reviewId: other.id, reporterId: target.user.id, reason: 'spam' })
    await stack.db.db.insert(auditLog).values({
      actorId: admin.user.id,
      action: 'role.grant',
      targetType: 'user',
      targetId: target.user.id,
      after: { role: 'moderator' },
      ip: '203.0.113.9',
    })

    const response = await detail(target.user.id, admin.cookies)
    expect(response.statusCode).toBe(200)
    const body = adminUserDetailSchema.parse(response.json())
    expect(body.user).toMatchObject({
      id: target.user.id,
      email: target.user.email,
      status: 'active',
      reviewCount: 1,
    })
    expect(body.reviews).toEqual({ pending: 1, approved: 1, rejected: 0, unpublished: 0 })
    expect(body.reports).toEqual({ filed: 1, received: 1 })
    expect(body.admin?.sessions).toHaveLength(1)
    expect(body.admin?.audit).toMatchObject([
      {
        action: 'role.grant',
        actor: { id: admin.user.id },
        after: { role: 'moderator' },
        ip: '203.0.113.9',
      },
    ])
  })

  it('omits email, sessions, and audit history for Moderators', async () => {
    const mod = await person(['moderator'])
    const target = await person()
    await stack.db.db.update(sessions).set({ ip: '198.51.100.7' })
    const response = await detail(target.user.id, mod.cookies)
    expect(response.statusCode).toBe(200)
    const body = adminUserDetailSchema.parse(response.json())
    expect(body.user.email).toBeNull()
    expect(body.user.emailVerifiedAt).toBeNull()
    expect(body.admin).toBeNull()
    expect(response.body).not.toContain('198.51.100.7')
    expect(response.body).not.toContain(target.user.email)
  })

  it('returns 404 for an unknown user and 400 for a malformed id', async () => {
    const admin = await person(['admin'])
    expect((await detail(newId(), admin.cookies)).statusCode).toBe(404)
    expect((await detail('nope', admin.cookies)).statusCode).toBe(400)
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    expect((await detail(member.user.id, member.cookies)).statusCode).toBe(403)
    expect((await detail(member.user.id)).statusCode).toBe(401)
  })
})

describe('PUT and DELETE /v1/admin/users/:id/roles/:role', () => {
  const put = (id: string, role: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'PUT',
      url: `/v1/admin/users/${id}/roles/${role}`,
      cookies,
      headers: { origin: ORIGIN },
    })
  const remove = (id: string, role: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'DELETE',
      url: `/v1/admin/users/${id}/roles/${role}`,
      cookies,
      headers: { origin: ORIGIN },
    })
  const audits = (action: 'role.grant' | 'role.remove') =>
    stack.db.db.select().from(auditLog).where(eq(auditLog.action, action))

  it('grants a role and records before and after values', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)

    const response = await put(target.id, 'moderator', admin.cookies)
    expect(response.statusCode).toBe(200)
    expect(adminUserRolesResponseSchema.parse(response.json())).toEqual({
      userId: target.id,
      roles: ['member', 'moderator'],
      changed: true,
    })
    const [entry] = await audits('role.grant')
    expect(entry).toMatchObject({
      actorId: admin.user.id,
      targetType: 'user',
      targetId: target.id,
      before: { roles: ['member'] },
      after: { roles: ['member', 'moderator'] },
    })
  })

  it('removes a role and records it', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db, { roles: ['member', 'moderator'] })

    const response = await remove(target.id, 'moderator', admin.cookies)
    expect(response.statusCode).toBe(200)
    expect(adminUserRolesResponseSchema.parse(response.json()).roles).toEqual(['member'])
    const [entry] = await audits('role.remove')
    expect(entry).toMatchObject({
      before: { roles: ['member', 'moderator'] },
      after: { roles: ['member'] },
    })
  })

  it('does nothing and writes no audit row when the role is already in that state', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db, { roles: ['member', 'moderator'] })

    const again = await put(target.id, 'moderator', admin.cookies)
    expect(adminUserRolesResponseSchema.parse(again.json()).changed).toBe(false)
    const none = await remove(target.id, 'admin', admin.cookies)
    expect(adminUserRolesResponseSchema.parse(none.json()).changed).toBe(false)
    expect(await audits('role.grant')).toHaveLength(0)
    expect(await audits('role.remove')).toHaveLength(0)
  })

  it('refuses to remove your own Admin role when you are the last Admin', async () => {
    const admin = await person(['member', 'admin'])

    const response = await remove(admin.user.id, 'admin', admin.cookies)
    expect(response.statusCode).toBe(409)
    expect(await audits('role.remove')).toHaveLength(0)
    const check = await detail(admin.user.id, admin.cookies)
    expect(adminUserDetailSchema.parse(check.json()).user.roles).toContain('admin')
  })

  it('lets an Admin remove their own role when another Admin exists', async () => {
    const admin = await person(['member', 'admin'])
    await createTestUser(stack.db.db, { roles: ['admin'] })

    const response = await remove(admin.user.id, 'admin', admin.cookies)
    expect(response.statusCode).toBe(200)
    expect(adminUserRolesResponseSchema.parse(response.json()).roles).toEqual(['member'])
  })

  it('rejects the member role, unknown users, and deleted accounts', async () => {
    const admin = await person(['admin'])
    const target = await createTestUser(stack.db.db)
    const deleted = await createTestUser(stack.db.db, { status: 'deleted' })

    expect((await put(target.id, 'member', admin.cookies)).statusCode).toBe(400)
    expect((await put(newId(), 'moderator', admin.cookies)).statusCode).toBe(404)
    expect((await put(deleted.id, 'moderator', admin.cookies)).statusCode).toBe(409)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const target = await createTestUser(stack.db.db)
    const moderator = await person(['moderator'])
    const member = await person()

    expect((await put(target.id, 'admin', moderator.cookies)).statusCode).toBe(403)
    expect((await remove(target.id, 'moderator', member.cookies)).statusCode).toBe(403)
    expect((await put(target.id, 'admin')).statusCode).toBe(401)
    expect(await audits('role.grant')).toHaveLength(0)
  })
})
