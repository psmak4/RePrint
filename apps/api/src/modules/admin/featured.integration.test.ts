import { auditLog, books, featuredItems, genres, reviews } from '@reprint/db'
import { adminFeaturedSchema, discoverResponseSchema, type ReviewStatus } from '@reprint/shared'
import { eq, inArray, like } from 'drizzle-orm'
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

const call = (method: 'GET' | 'PUT', cookies?: Record<string, string>, payload?: object) =>
  app.inject({ method, url: '/v1/admin/featured', cookies, payload, headers: { origin: ORIGIN } })

async function genre(slug: string, extra: Partial<typeof genres.$inferInsert> = {}) {
  const [row] = await stack.db.db
    .insert(genres)
    .values({ slug, name: slug.toUpperCase(), ...extra })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function review(slug: string, status: ReviewStatus = 'approved', hidden = false) {
  const author = await createTestUser(stack.db.db)
  const [book] = await stack.db.db.insert(books).values({ slug, title: slug }).returning()
  if (!book) throw new Error('book not stored')
  const [row] = await stack.db.db
    .insert(reviews)
    .values({
      userId: author.id,
      bookId: book.id,
      rating: 5,
      body: 'A fine book, well worth reading twice. '.repeat(8),
      status,
      decidedAt: new Date(),
      hiddenAt: hidden ? new Date() : null,
    })
    .returning()
  if (!row) throw new Error('review not stored')
  return row
}

async function discoverRows() {
  const res = await app.inject({ method: 'GET', url: '/v1/discover' })
  return discoverResponseSchema.parse(res.json())
}

describe('GET /v1/admin/featured', () => {
  it('shows the picks, every live Genre, and Approved reviews to pick from', async () => {
    const moderator = await person(['moderator'])
    const picked = await genre('zz-picked')
    await genre('zz-archived', { archivedAt: new Date() })
    const good = await review('zz-good')
    await review('zz-pending', 'pending')
    await stack.db.db.insert(featuredItems).values([
      { kind: 'genre', refId: picked.id, position: 0 },
      { kind: 'review', refId: good.id, position: 0 },
    ])
    const res = await call('GET', moderator.cookies)
    expect(res.statusCode).toBe(200)
    const body = adminFeaturedSchema.parse(res.json())
    expect(body.genres.map((g) => g.slug)).toEqual(['zz-picked'])
    expect(body.genreOptions.map((g) => g.slug)).not.toContain('zz-archived')
    expect(body.review?.review.id).toBe(good.id)
    expect(body.candidates.map((c) => c.review.id)).toEqual([good.id])
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    expect((await call('GET', member.cookies)).statusCode).toBe(403)
    expect((await call('GET')).statusCode).toBe(401)
  })
})

describe('PUT /v1/admin/featured', () => {
  it('sets the Genres in order and the review, rebuilds Discover, and audits it', async () => {
    const admin = await person(['admin'])
    const a = await genre('zz-a')
    const b = await genre('zz-b')
    const pick = await review('zz-pick')
    const res = await call('PUT', admin.cookies, { genreIds: [b.id, a.id], reviewId: pick.id })
    expect(res.statusCode).toBe(200)
    const body = adminFeaturedSchema.parse(res.json())
    expect(body.genres.map((g) => g.slug)).toEqual(['zz-b', 'zz-a'])
    expect(body.review?.review.id).toBe(pick.id)

    const rows = await discoverRows()
    expect(rows.featuredGenres?.map((g) => g.slug)).toEqual(['zz-b', 'zz-a'])
    expect(rows.featuredReview?.review.id).toBe(pick.id)

    const flagged = await stack.db.db
      .select({ slug: genres.slug })
      .from(genres)
      .where(eq(genres.featured, true))
    expect(flagged.map((g) => g.slug).sort()).toEqual(['zz-a', 'zz-b'])

    const log = await stack.db.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'featured.change'))
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      actorId: admin.user.id,
      targetType: 'featured_item',
      after: { genres: ['zz-b', 'zz-a'], reviewId: pick.id },
    })
  })

  it('replaces earlier picks and clears the review with null', async () => {
    const admin = await person(['admin'])
    const a = await genre('zz-a')
    const first = await review('zz-first')
    await call('PUT', admin.cookies, { genreIds: [a.id], reviewId: first.id })
    const res = await call('PUT', admin.cookies, { genreIds: [], reviewId: null })
    expect(res.statusCode).toBe(200)
    expect(adminFeaturedSchema.parse(res.json())).toMatchObject({ genres: [], review: null })
    const rows = await discoverRows()
    expect(rows.featuredGenres).toBeNull()
    expect(rows.featuredReview).toBeNull()
  })

  it('lets a Moderator set the review but not the Genres', async () => {
    const moderator = await person(['moderator'])
    const a = await genre('zz-a')
    const pick = await review('zz-pick')
    const ok = await call('PUT', moderator.cookies, { reviewId: pick.id })
    expect(ok.statusCode).toBe(200)
    const denied = await call('PUT', moderator.cookies, { genreIds: [a.id] })
    expect(denied.statusCode).toBe(403)
    const items = await stack.db.db
      .select()
      .from(featuredItems)
      .where(inArray(featuredItems.kind, ['genre']))
    expect(items).toHaveLength(0)
  })

  it('refuses a review that is not Approved, hidden, or missing, and bad Genres', async () => {
    const admin = await person(['admin'])
    const pending = await review('zz-pending', 'pending')
    const hidden = await review('zz-hidden', 'approved', true)
    const archived = await genre('zz-archived', { archivedAt: new Date() })
    for (const reviewId of [pending.id, hidden.id, '0199aaaa-0000-7000-8000-000000000000']) {
      expect((await call('PUT', admin.cookies, { reviewId })).statusCode).toBe(400)
    }
    expect((await call('PUT', admin.cookies, { genreIds: [archived.id] })).statusCode).toBe(400)
    const many = Array.from({ length: 13 }, () => archived.id)
    expect((await call('PUT', admin.cookies, { genreIds: many })).statusCode).toBe(400)
    expect((await call('PUT', admin.cookies, {})).statusCode).toBe(400)
    expect(await stack.db.db.select().from(featuredItems)).toHaveLength(0)
    expect(
      await stack.db.db.select().from(auditLog).where(eq(auditLog.action, 'featured.change')),
    ).toHaveLength(0)
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    expect((await call('PUT', member.cookies, { reviewId: null })).statusCode).toBe(403)
    expect((await call('PUT', undefined, { reviewId: null })).statusCode).toBe(401)
  })
})
