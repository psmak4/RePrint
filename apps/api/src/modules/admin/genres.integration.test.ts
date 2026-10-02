import { auditLog, authors, books, editions, genres, newId, subjectGenreRules } from '@reprint/db'
import {
  adminCatalogStatsSchema,
  adminGenreSchema,
  adminGenresResponseSchema,
  adminSubjectRuleSchema,
  adminSubjectRulesResponseSchema,
} from '@reprint/shared'
import { eq, like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'

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
  // Genres are reference data that `reset` keeps; drop the ones these tests made.
  await stack.db.db.delete(genres).where(like(genres.slug, 'zz-%'))
})

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

const call = (
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  cookies?: Record<string, string>,
  payload?: object,
) => app.inject({ method, url, cookies, payload, headers: { origin: ORIGIN } })

async function genre(slug: string, extra: Partial<typeof genres.$inferInsert> = {}) {
  const [row] = await stack.db.db
    .insert(genres)
    .values({ slug, name: slug.toUpperCase(), ...extra })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function expectDenied(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  const moderator = await person(['moderator'])
  const member = await person()
  expect((await call(method, url, moderator.cookies, payload)).statusCode).toBe(403)
  expect((await call(method, url, member.cookies, payload)).statusCode).toBe(403)
  expect((await call(method, url, undefined, payload)).statusCode).toBe(401)
}

describe('GET /v1/admin/genres', () => {
  it('lists every Genre with its Book and rule counts, archived ones too', async () => {
    const admin = await person(['admin'])
    const live = await genre('zz-live')
    await genre('zz-old', { archivedAt: new Date() })
    await stack.db.db
      .insert(subjectGenreRules)
      .values({ pattern: 'zz pattern', genreId: live.id, priority: 7 })
    const res = await call('GET', '/v1/admin/genres', admin.cookies)
    expect(res.statusCode).toBe(200)
    const items = adminGenresResponseSchema.parse(res.json()).items
    expect(items.find((g) => g.slug === 'zz-live')).toMatchObject({ ruleCount: 1, archived: false })
    expect(items.find((g) => g.slug === 'zz-old')?.archived).toBe(true)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    await expectDenied('GET', '/v1/admin/genres')
  })
})

describe('POST /v1/admin/genres', () => {
  it('creates a Genre and audits it', async () => {
    const admin = await person(['admin'])
    const parent = await genre('zz-parent')
    const res = await call('POST', '/v1/admin/genres', admin.cookies, {
      slug: 'zz-child',
      name: 'Child',
      description: 'A child.',
      parentId: parent.id,
    })
    expect(res.statusCode).toBe(201)
    expect(adminGenreSchema.parse(res.json())).toMatchObject({
      slug: 'zz-child',
      parentId: parent.id,
    })
    const log = await stack.db.db.select().from(auditLog).where(eq(auditLog.action, 'genre.change'))
    expect(log).toHaveLength(1)
  })

  it('rejects a taken slug with 409, a bad slug with 400, and a grandchild with 400', async () => {
    const admin = await person(['admin'])
    const parent = await genre('zz-parent')
    const child = await genre('zz-child', { parentId: parent.id })
    const post = (payload: object) => call('POST', '/v1/admin/genres', admin.cookies, payload)
    expect((await post({ slug: 'zz-parent', name: 'Dup' })).statusCode).toBe(409)
    expect((await post({ slug: 'Not A Slug', name: 'Bad' })).statusCode).toBe(400)
    expect((await post({ slug: 'zz-grand', name: 'G', parentId: child.id })).statusCode).toBe(400)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    await expectDenied('POST', '/v1/admin/genres', { slug: 'zz-x', name: 'X' })
  })
})

describe('PATCH /v1/admin/genres/:id', () => {
  it('edits fields, archives, restores, and audits before and after', async () => {
    const admin = await person(['admin'])
    const row = await genre('zz-edit')
    const url = `/v1/admin/genres/${row.id}`
    const edited = await call('PATCH', url, admin.cookies, { name: 'Renamed', description: 'New.' })
    expect(edited.statusCode).toBe(200)
    expect(adminGenreSchema.parse(edited.json())).toMatchObject({
      name: 'Renamed',
      description: 'New.',
    })
    const archived = await call('PATCH', url, admin.cookies, { archived: true })
    expect(adminGenreSchema.parse(archived.json()).archived).toBe(true)
    const restored = await call('PATCH', url, admin.cookies, { archived: false })
    expect(adminGenreSchema.parse(restored.json()).archived).toBe(false)
    const log = await stack.db.db.select().from(auditLog).where(eq(auditLog.action, 'genre.change'))
    expect(log).toHaveLength(3)
    expect(log[0]?.before).toMatchObject({ name: 'ZZ-EDIT' })
  })

  it('hides an archived Genre from public browsing and from Subject mapping', async () => {
    const admin = await person(['admin'])
    const row = await genre('zz-hidden')
    expect((await call('GET', '/v1/genres/zz-hidden')).statusCode).toBe(200)
    await call('PATCH', `/v1/admin/genres/${row.id}`, admin.cookies, { archived: true })
    expect((await call('GET', '/v1/genres/zz-hidden')).statusCode).toBe(404)
    const tree = await call('GET', '/v1/genres')
    expect(JSON.stringify(tree.json())).not.toContain('zz-hidden')
  })

  it('refuses to archive a Genre with live children, to nest a parent, and a self-parent', async () => {
    const admin = await person(['admin'])
    const parent = await genre('zz-parent')
    const child = await genre('zz-child', { parentId: parent.id })
    const other = await genre('zz-other')
    const patch = (id: string, payload: object) =>
      call('PATCH', `/v1/admin/genres/${id}`, admin.cookies, payload)
    expect((await patch(parent.id, { archived: true })).statusCode).toBe(409)
    expect((await patch(parent.id, { parentId: other.id })).statusCode).toBe(400)
    expect((await patch(other.id, { parentId: other.id })).statusCode).toBe(400)
    expect((await patch(other.id, { slug: 'zz-parent' })).statusCode).toBe(409)
    expect((await patch(newId(), { name: 'Nope' })).statusCode).toBe(404)
    expect((await patch(child.id, {})).statusCode).toBe(400)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const row = await genre('zz-denied')
    await expectDenied('PATCH', `/v1/admin/genres/${row.id}`, { name: 'Nope' })
  })
})

describe('Subject rules', () => {
  it('lists, creates, and removes rules, auditing each change', async () => {
    const admin = await person(['admin'])
    const row = await genre('zz-rules')
    const created = await call('POST', '/v1/admin/subject-rules', admin.cookies, {
      pattern: 'space opera',
      genreId: row.id,
      priority: 80,
    })
    expect(created.statusCode).toBe(201)
    const rule = adminSubjectRuleSchema.parse(created.json())
    expect(rule).toMatchObject({ pattern: 'space opera', priority: 80 })
    const listed = await call('GET', '/v1/admin/subject-rules', admin.cookies)
    expect(adminSubjectRulesResponseSchema.parse(listed.json()).items.map((r) => r.id)).toContain(
      rule.id,
    )
    const removed = await call('DELETE', `/v1/admin/subject-rules/${rule.id}`, admin.cookies)
    expect(removed.statusCode).toBe(200)
    expect(
      await stack.db.db.select().from(subjectGenreRules).where(eq(subjectGenreRules.id, rule.id)),
    ).toHaveLength(0)
    const log = await stack.db.db.select().from(auditLog)
    expect(log.map((l) => l.action).sort()).toEqual(['subject_rule.change', 'subject_rule.change'])
  })

  it('rejects a duplicate pair with 409, an archived or unknown Genre, and an unknown rule', async () => {
    const admin = await person(['admin'])
    const row = await genre('zz-rules')
    const old = await genre('zz-old', { archivedAt: new Date() })
    const post = (payload: object) =>
      call('POST', '/v1/admin/subject-rules', admin.cookies, payload)
    expect((await post({ pattern: 'a', genreId: row.id })).statusCode).toBe(201)
    expect((await post({ pattern: 'a', genreId: row.id })).statusCode).toBe(409)
    expect((await post({ pattern: 'a', genreId: old.id })).statusCode).toBe(400)
    expect((await post({ pattern: 'a', genreId: newId() })).statusCode).toBe(404)
    expect(
      (await call('DELETE', `/v1/admin/subject-rules/${newId()}`, admin.cookies)).statusCode,
    ).toBe(404)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const row = await genre('zz-denied')
    await expectDenied('GET', '/v1/admin/subject-rules')
    await expectDenied('POST', '/v1/admin/subject-rules', { pattern: 'x', genreId: row.id })
    await expectDenied('DELETE', `/v1/admin/subject-rules/${newId()}`)
  })
})

describe('GET /v1/admin/catalog/stats', () => {
  it('returns Catalog size and twelve months of growth', async () => {
    const admin = await person(['admin'])
    const id = newId()
    const [book] = await stack.db.db
      .insert(books)
      .values({ id, slug: `stats-${id.slice(-6)}`, title: 'Stats' })
      .returning()
    if (!book) throw new Error('seed failed')
    await stack.db.db.insert(editions).values({ bookId: book.id })
    await stack.db.db
      .insert(authors)
      .values({ name: 'Stat Author', slug: `stat-author-${id.slice(-6)}` })
    const old = new Date()
    old.setUTCMonth(old.getUTCMonth() - 3, 15)
    await stack.db.db.update(books).set({ createdAt: old }).where(eq(books.id, book.id))
    const res = await call('GET', '/v1/admin/catalog/stats', admin.cookies)
    expect(res.statusCode).toBe(200)
    const stats = adminCatalogStatsSchema.parse(res.json())
    expect(stats.totals).toEqual({ books: 1, editions: 1, authors: 1 })
    expect(stats.monthly).toHaveLength(12)
    const thisMonth = stats.monthly.at(-1)
    expect(thisMonth).toMatchObject({ books: 0, editions: 1, authors: 1 })
    expect(stats.monthly.at(-4)?.books).toBe(1)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    await expectDenied('GET', '/v1/admin/catalog/stats')
  })
})
