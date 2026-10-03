import { permissions, rolePermissions, roles, sessions, userRoles } from '@reprint/db'
import { PERMISSIONS, problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { requireAuth, requirePermission, requireVerified } from './guards.js'
import { SESSION_COOKIE } from './session-cookie.js'
import { hashToken } from './tokens.js'

const DAY_MS = 24 * 60 * 60 * 1000

let stack: TestStack
let app: FastifyInstance
let secureApp: FastifyInstance

function envFor(extra: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    ...extra,
  })
}

/** Adds routes that exist only for these tests. */
function addTestRoutes(instance: FastifyInstance) {
  instance.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await instance.sessions.start(request, reply, userId)
    return { ok: true }
  })
  instance.get('/test/end', async (request, reply) => {
    await instance.sessions.end(request, reply)
    return { ok: true }
  })
  instance.get('/test/whoami', async (request) => ({
    userId: request.auth?.user.id ?? null,
    permissions: [...(request.auth?.permissions ?? [])].sort(),
  }))
  instance.get('/test/auth', { preHandler: requireAuth }, async () => ({ ok: true }))
  instance.get('/test/verified', { preHandler: requireVerified }, async () => ({ ok: true }))
  instance.get(
    '/test/moderator',
    { preHandler: requirePermission(PERMISSIONS.reviewsModerate) },
    async () => ({ ok: true }),
  )
}

/** Signs `userId` in and returns the raw cookie token. */
async function signIn(userId: string, instance: FastifyInstance = app) {
  const response = await instance.inject({ method: 'GET', url: `/test/start/${userId}` })
  const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)
  if (!cookie) throw new Error('no session cookie was set')
  return { token: cookie.value, response }
}

const withCookie = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` })

beforeAll(async () => {
  stack = await startTestStack()
  app = await buildApp(envFor(), { database: stack.db.db })
  addTestRoutes(app)
  await app.ready()
  secureApp = await buildApp(envFor({ APP_ENV: 'production', COOKIE_DOMAIN: 'reprint.test' }), {
    database: stack.db.db,
  })
  addTestRoutes(secureApp)
  await secureApp.ready()
})

afterAll(async () => {
  await app?.close()
  await secureApp?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

describe('the rp_session cookie', () => {
  it('holds a random 256-bit token and stores only its SHA-256 hash', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)

    const rows = await stack.db.db.select().from(sessions)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(rows[0]?.tokenHash).not.toBe(token)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('is HttpOnly and SameSite=Lax, and not Secure or domain-scoped locally', async () => {
    const user = await createTestUser(stack.db.db)
    const { response } = await signIn(user.id)
    const header = String(response.headers['set-cookie'])
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).toContain('Path=/')
    expect(header).toContain(`Max-Age=${30 * 24 * 60 * 60}`)
    expect(header).not.toContain('Secure')
    expect(header).not.toContain('Domain=')
  })

  it('is Secure and uses Domain=$COOKIE_DOMAIN outside local', async () => {
    const user = await createTestUser(stack.db.db)
    const { response } = await signIn(user.id, secureApp)
    const header = String(response.headers['set-cookie'])
    expect(header).toContain('Secure')
    expect(header).toContain('Domain=reprint.test')
    expect(header).toContain('HttpOnly')
  })

  it('records the device and expires 30 days out', async () => {
    const user = await createTestUser(stack.db.db)
    await app.inject({
      method: 'GET',
      url: `/test/start/${user.id}`,
      headers: { 'user-agent': 'TestBrowser/1.0' },
    })
    const [row] = await stack.db.db.select().from(sessions)
    expect(row?.userAgent).toBe('TestBrowser/1.0')
    expect(row?.ip).toBeTruthy()
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / DAY_MS
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThanOrEqual(30)
  })
})

describe('session lookup', () => {
  it('identifies the user and loads their permissions from their roles', async () => {
    const user = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const { token } = await signIn(user.id)
    const body = (
      await app.inject({ method: 'GET', url: '/test/whoami', headers: withCookie(token) })
    ).json()
    expect(body.userId).toBe(user.id)
    expect(body.permissions).toContain('reviews.moderate')
    expect(body.permissions).toContain('reviews.write')
    expect(body.permissions).not.toContain('roles.assign')
  })

  it('treats a missing or unknown cookie as a Visitor', async () => {
    expect((await app.inject({ method: 'GET', url: '/test/whoami' })).json().userId).toBeNull()
    const unknown = await app.inject({
      method: 'GET',
      url: '/test/whoami',
      headers: withCookie('not-a-real-token'),
    })
    expect(unknown.json().userId).toBeNull()
    expect(unknown.headers['set-cookie']).toContain(`${SESSION_COOKIE}=;`)
  })

  it('rejects an expired session', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    await stack.db.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id))
    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a session older than SESSION_MAX_DAYS even when used yesterday', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    await stack.db.db
      .update(sessions)
      .set({
        createdAt: new Date(Date.now() - 91 * DAY_MS),
        lastSeenAt: new Date(Date.now() - DAY_MS / 2),
        expiresAt: new Date(Date.now() + 20 * DAY_MS),
      })
      .where(eq(sessions.userId, user.id))
    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(401)
    expect(response.headers['set-cookie']).toContain(`${SESSION_COOKIE}=;`)
  })

  it('keeps a session younger than SESSION_MAX_DAYS', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    await stack.db.db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 89 * DAY_MS) })
      .where(eq(sessions.userId, user.id))
    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
  })

  it.each(['suspended', 'deleted'] as const)('rejects a session of a %s user', async (status) => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const before = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(before.statusCode).toBe(200)

    await stack.db.sql`update users set status = ${status} where id = ${user.id}`
    const after = await app.inject({ method: 'GET', url: '/test/auth', headers: withCookie(token) })
    expect(after.statusCode).toBe(401)
  })

  it('ends the session and clears the cookie on `end`', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/test/end',
      headers: withCookie(token),
    })
    expect(String(response.headers['set-cookie'])).toContain(`${SESSION_COOKIE}=;`)
    expect(await stack.db.db.select().from(sessions)).toHaveLength(0)
    const after = await app.inject({ method: 'GET', url: '/test/auth', headers: withCookie(token) })
    expect(after.statusCode).toBe(401)
  })
})

describe('sliding expiry (D-027)', () => {
  it('renews a session last seen over a day ago and re-issues the cookie', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const staleSeen = new Date(Date.now() - 2 * DAY_MS)
    await stack.db.db
      .update(sessions)
      .set({ lastSeenAt: staleSeen, expiresAt: new Date(Date.now() + 5 * DAY_MS) })
      .where(eq(sessions.userId, user.id))

    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe(token)

    const [row] = await stack.db.db.select().from(sessions)
    expect(row?.lastSeenAt.getTime()).toBeGreaterThan(staleSeen.getTime() + DAY_MS)
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / DAY_MS
    expect(days).toBeGreaterThan(29.9)
  })

  it('does not write for a session seen within the last day', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const recent = new Date(Date.now() - 60 * 60 * 1000)
    const expiresAt = new Date(Date.now() + 10 * DAY_MS)
    await stack.db.db
      .update(sessions)
      .set({ lastSeenAt: recent, expiresAt })
      .where(eq(sessions.userId, user.id))

    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['set-cookie']).toBeUndefined()
    const [row] = await stack.db.db.select().from(sessions)
    expect(row?.lastSeenAt.getTime()).toBe(recent.getTime())
    expect(row?.expiresAt.getTime()).toBe(expiresAt.getTime())
  })
})

describe('requireAuth', () => {
  it('allows a signed-in Member', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/test/auth',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
  })

  it('denies a Visitor with 401 Problem Details', async () => {
    const response = await app.inject({ method: 'GET', url: '/test/auth' })
    expect(response.statusCode).toBe(401)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(problemDetailsSchema.parse(response.json()).status).toBe(401)
  })
})

describe('requireVerified', () => {
  it('allows a verified Member', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/test/verified',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
  })

  it('denies an unverified Member with 403 and a Visitor with 401', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const { token } = await signIn(user.id)
    const unverified = await app.inject({
      method: 'GET',
      url: '/test/verified',
      headers: withCookie(token),
    })
    expect(unverified.statusCode).toBe(403)
    expect(problemDetailsSchema.parse(unverified.json()).status).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/test/verified' })).statusCode).toBe(401)
  })
})

describe('requirePermission', () => {
  it('allows a Moderator on a moderator-only route', async () => {
    const user = await createTestUser(stack.db.db, { roles: ['moderator'] })
    const { token } = await signIn(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/test/moderator',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
  })

  it('denies a Member with 403 and a Visitor with 401', async () => {
    const user = await createTestUser(stack.db.db)
    const { token } = await signIn(user.id)
    const member = await app.inject({
      method: 'GET',
      url: '/test/moderator',
      headers: withCookie(token),
    })
    expect(member.statusCode).toBe(403)
    expect(problemDetailsSchema.parse(member.json()).status).toBe(403)
    expect((await app.inject({ method: 'GET', url: '/test/moderator' })).statusCode).toBe(401)
  })

  it('checks permissions, not role names: a new role with the permission is allowed', async () => {
    const [curator] = await stack.db.db
      .insert(roles)
      .values({ name: 'curator', description: 'Test-only role' })
      .returning()
    const [permission] = await stack.db.db
      .select()
      .from(permissions)
      .where(eq(permissions.name, PERMISSIONS.reviewsModerate))
    if (!curator || !permission) throw new Error('setup failed')
    await stack.db.db
      .insert(rolePermissions)
      .values({ roleId: curator.id, permissionId: permission.id })

    const user = await createTestUser(stack.db.db, { roles: [] })
    await stack.db.db.insert(userRoles).values({ userId: user.id, roleId: curator.id })
    const { token } = await signIn(user.id)
    const response = await app.inject({
      method: 'GET',
      url: '/test/moderator',
      headers: withCookie(token),
    })
    expect(response.statusCode).toBe(200)
  })
})
