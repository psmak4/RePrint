import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { authTokens, covers, newId, notifications, sessions, users } from '@reprint/db'
import { ACCOUNT_ERASE_AFTER_DAYS, problemDetailsSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { type JobName, type JobPayload, jobs } from '../../jobs/registry.js'
import { LocalImageStorage } from '../../storage/index.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { hashPassword } from '../auth/password.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const PASSWORD = 'correct horse battery staple'
const DAY_MS = 24 * 60 * 60 * 1000

let stack: TestStack
let app: FastifyInstance
let storageDir: string
let storage: LocalImageStorage
let enqueued: { name: JobName; payload: JobPayload<JobName> }[]

beforeAll(async () => {
  stack = await startTestStack()
  storageDir = await mkdtemp(join(tmpdir(), 'reprint-erase-'))
  storage = new LocalImageStorage(storageDir, 'http://localhost/uploads')
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
    storage,
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
  await rm(storageDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await stack.reset()
  enqueued.length = 0
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

function deleteAccount(cookies: Record<string, string> | undefined, password: string) {
  return app.inject({
    method: 'DELETE',
    url: '/v1/me',
    cookies,
    headers: { origin: ORIGIN },
    payload: { password },
  })
}

describe('DELETE /v1/me', () => {
  it('disables the account, ends every session, and queues the deletion email', async () => {
    const { user, cookies } = await signedInMember()
    // A second device and an unused link.
    await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
    await stack.db.db.insert(authTokens).values({
      userId: user.id,
      tokenHash: 'a'.repeat(64),
      purpose: 'reset_password',
      expiresAt: new Date(Date.now() + DAY_MS),
    })

    const response = await deleteAccount(cookies, PASSWORD)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'account_deletion_scheduled' })

    const [row] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(row?.status).toBe('deleted')
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect(await stack.db.db.select().from(sessions).where(eq(sessions.userId, user.id))).toEqual(
      [],
    )
    expect(await stack.db.db.select().from(authTokens)).toEqual([])
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.payload).toMatchObject({
      template: 'account-deletion-scheduled',
      to: user.email,
      props: { username: user.username, eraseAfterDays: ACCOUNT_ERASE_AFTER_DAYS },
    })

    // The old cookie no longer signs anyone in.
    const after = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(after.statusCode).toBe(401)
  })

  it('refuses a wrong password and changes nothing', async () => {
    const { user, cookies } = await signedInMember()
    const response = await deleteAccount(cookies, 'not the password')
    expect(response.statusCode).toBe(400)
    const problem = problemDetailsSchema.parse(response.json())
    expect(problem.errors?.map((error) => error.path)).toContain('body.password')
    const [row] = await stack.db.db.select().from(users).where(eq(users.id, user.id))
    expect(row?.status).toBe('active')
    expect(row?.deletedAt).toBeNull()
    expect(enqueued).toEqual([])
    const still = await app.inject({ method: 'GET', url: '/v1/me', cookies })
    expect(still.statusCode).toBe(200)
  })

  it('returns 401 for a Visitor', async () => {
    const response = await deleteAccount(undefined, PASSWORD)
    expect(response.statusCode).toBe(401)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(401)
  })

  it('returns 400 when the password is missing', async () => {
    const { cookies } = await signedInMember()
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      cookies,
      headers: { origin: ORIGIN },
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('accounts.erase job', () => {
  const log = pino({ level: 'silent' })
  const run = (now?: Date) =>
    jobs['accounts.erase'].handler(
      { now: now?.toISOString() },
      // The job only reads the database, storage, and log.
      { log, db: stack.db.db, storage, mailer: undefined as never, catalog: undefined as never },
    )

  async function deletedUser(deletedDaysAgo: number) {
    const user = await createTestUser(stack.db.db)
    await stack.db.db
      .update(users)
      .set({ status: 'deleted', deletedAt: new Date(Date.now() - deletedDaysAgo * DAY_MS) })
      .where(eq(users.id, user.id))
    return user
  }

  it('erases accounts deleted more than 30 days ago, with cascaded rows and avatar files', async () => {
    const old = await deletedUser(ACCOUNT_ERASE_AFTER_DAYS + 1)
    const recent = await deletedUser(ACCOUNT_ERASE_AFTER_DAYS - 1)
    const active = await createTestUser(stack.db.db)

    const coverId = newId()
    const key = `avatars/${coverId}.webp`
    await storage.put(key, Buffer.from('avatar'))
    await stack.db.db.insert(covers).values({ id: coverId, origin: 'upload', r2Key: key })
    await stack.db.db.update(users).set({ avatarId: coverId }).where(eq(users.id, old.id))
    await stack.db.db.insert(notifications).values({ userId: old.id, type: 'test' })
    await stack.db.db.insert(sessions).values({
      userId: old.id,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + DAY_MS),
    })

    // With the real clock the 31-day-old account is due; the 29-day-old one is not.
    expect(await run()).toEqual({ erased: 1 })
    const remaining = await stack.db.db.select({ id: users.id }).from(users)
    expect(remaining.map((row) => row.id).sort()).toEqual([recent.id, active.id].sort())
    expect(await stack.db.db.select().from(notifications)).toEqual([])
    expect(await stack.db.db.select().from(sessions)).toEqual([])
    expect(await stack.db.db.select().from(covers)).toEqual([])
    await expect(readFile(join(storageDir, key))).rejects.toThrow()

    // A clock 2 days ahead makes the recent one due too; active accounts are never touched.
    expect(await run(new Date(Date.now() + 2 * DAY_MS))).toEqual({ erased: 1 })
    const left = await stack.db.db.select({ id: users.id }).from(users)
    expect(left.map((row) => row.id)).toEqual([active.id])
    // Running again finds nothing.
    expect(await run()).toEqual({ erased: 0 })
  })

  it('runs daily through the registry schedule', () => {
    expect(jobs['accounts.erase'].schedule?.everyMs).toBe(DAY_MS)
  })
})
