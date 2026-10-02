import {
  auditLog,
  books,
  newId,
  notifications,
  reviewReports,
  reviews,
  reviewVersions,
} from '@reprint/db'
import {
  modQueueResponseSchema,
  modReportsResponseSchema,
  modStatsSchema,
  reportDismissResponseSchema,
  reviewUnpublishResponseSchema,
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

/** An Approved review with `reports` open reports, filed `minutesAgo` minutes ago. */
async function reportedReview(authorId: string, reports = 1, minutesAgo = 5) {
  const bookId = newId()
  const slug = `book-${bookId.slice(-8)}`
  await stack.db.db.insert(books).values({
    id: bookId,
    slug,
    title: 'A Book',
    reviewCount: 1,
    ratingSum: 4,
    ratingCounts: [0, 0, 0, 1, 0],
  })
  const [review] = await stack.db.db
    .insert(reviews)
    .values({
      userId: authorId,
      bookId,
      rating: 4,
      body: BODY,
      status: 'approved',
      hiddenAt: reports >= 3 ? new Date() : null,
    })
    .returning()
  if (!review) throw new Error('seed failed')
  await stack.db.db
    .insert(reviewVersions)
    .values({ reviewId: review.id, version: 1, rating: 4, body: BODY, status: 'approved' })
  for (let index = 0; index < reports; index++) {
    const reporter = await createTestUser(stack.db.db)
    await stack.db.db.insert(reviewReports).values({
      reviewId: review.id,
      reporterId: reporter.id,
      reason: index === 0 ? 'other' : 'spam',
      note: index === 0 ? 'Targets another reader.' : null,
      createdAt: new Date(Date.now() - (minutesAgo - index) * 60_000),
    })
  }
  return { review, bookId, slug }
}

const queue = (cookies?: Record<string, string>, query = '') =>
  app.inject({ method: 'GET', url: `/v1/mod/reports${query}`, cookies })
const dismiss = (reviewId: string, cookies?: Record<string, string>, payload = {}) =>
  app.inject({
    method: 'POST',
    url: `/v1/mod/reports/${reviewId}/dismiss`,
    cookies,
    headers: { origin: ORIGIN },
    payload,
  })
const unpublish = (id: string, cookies?: Record<string, string>, payload: object = {}) =>
  app.inject({
    method: 'POST',
    url: `/v1/mod/reviews/${id}/unpublish`,
    cookies,
    headers: { origin: ORIGIN },
    payload,
  })

describe('GET /v1/mod/reports', () => {
  it('groups open reports by review, oldest first, with reasons', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const older = await reportedReview(author.user.id, 3, 60)
    const newer = await reportedReview(author.user.id, 1, 5)

    const response = await queue(mod.cookies)
    expect(response.statusCode).toBe(200)
    const body = modReportsResponseSchema.parse(response.json())
    expect(body.items.map((item) => item.review.id)).toEqual([older.review.id, newer.review.id])
    const [first] = body.items
    expect(first).toMatchObject({
      openCount: 3,
      review: {
        hidden: true,
        status: 'approved',
        book: { slug: older.slug },
        author: { id: author.user.id, username: author.user.username },
      },
    })
    expect(first?.reports.map((report) => report.reason)).toEqual(['other', 'spam', 'spam'])
    expect(first?.reports[0]?.note).toBe('Targets another reader.')
    expect(body.meta.nextCursor).toBeNull()
  })

  it('pages with a cursor and rejects a malformed one', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const a = await reportedReview(author.user.id, 1, 30)
    const b = await reportedReview(author.user.id, 1, 20)
    const c = await reportedReview(author.user.id, 1, 10)

    const one = modReportsResponseSchema.parse((await queue(mod.cookies, '?limit=2')).json())
    expect(one.items.map((item) => item.review.id)).toEqual([a.review.id, b.review.id])
    expect(one.meta.nextCursor).not.toBeNull()
    const two = modReportsResponseSchema.parse(
      (await queue(mod.cookies, `?limit=2&cursor=${one.meta.nextCursor}`)).json(),
    )
    expect(two.items.map((item) => item.review.id)).toEqual([c.review.id])
    expect(two.meta.nextCursor).toBeNull()
    expect((await queue(mod.cookies, '?cursor=nope')).statusCode).toBe(400)
  })

  it('skips closed reports and the moderator’s own reviews', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const closed = await reportedReview(author.user.id)
    await stack.db.db
      .update(reviewReports)
      .set({ status: 'dismissed' })
      .where(eq(reviewReports.reviewId, closed.review.id))
    await reportedReview(mod.user.id)
    expect(modReportsResponseSchema.parse((await queue(mod.cookies)).json()).items).toEqual([])
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    expect((await queue(member.cookies)).statusCode).toBe(403)
    expect((await queue()).statusCode).toBe(401)
  })
})

describe('POST /v1/mod/reports/:reviewId/dismiss', () => {
  it('closes the reports, un-hides the review, and audits it', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review } = await reportedReview(author.user.id, 3)

    const response = await dismiss(review.id, mod.cookies, { reason: 'Reads fine.' })
    expect(response.statusCode).toBe(200)
    expect(reportDismissResponseSchema.parse(response.json())).toEqual({
      reviewId: review.id,
      closedReports: 3,
    })

    const rows = await stack.db.db.select().from(reviewReports)
    expect(rows.every((row) => row.status === 'dismissed')).toBe(true)
    expect(rows[0]).toMatchObject({ resolvedBy: mod.user.id, resolution: 'Reads fine.' })
    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after).toMatchObject({ status: 'approved', hiddenAt: null })
    const [audit] = await stack.db.db.select().from(auditLog)
    expect(audit).toMatchObject({
      actorId: mod.user.id,
      action: 'report.dismiss',
      targetType: 'review',
      targetId: review.id,
    })
    expect(modReportsResponseSchema.parse((await queue(mod.cookies)).json()).items).toEqual([])
  })

  it('answers 404, 409, and 403 for an unknown review, no open reports, and your own review', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review } = await reportedReview(author.user.id)
    const own = await reportedReview(mod.user.id)
    expect((await dismiss(newId(), mod.cookies)).statusCode).toBe(404)
    expect((await dismiss(own.review.id, mod.cookies)).statusCode).toBe(403)
    expect((await dismiss(review.id, mod.cookies)).statusCode).toBe(200)
    expect((await dismiss(review.id, mod.cookies)).statusCode).toBe(409)
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    const author = await person()
    const { review } = await reportedReview(author.user.id)
    expect((await dismiss(review.id, member.cookies)).statusCode).toBe(403)
    expect((await dismiss(review.id)).statusCode).toBe(401)
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)
  })
})

describe('POST /v1/mod/reviews/:id/unpublish', () => {
  it('unpublishes, updates aggregates, closes reports, notifies the author, and audits it', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review, bookId, slug } = await reportedReview(author.user.id, 3)

    const response = await unpublish(review.id, mod.cookies, { reason: '  Targets a reader.  ' })
    expect(response.statusCode).toBe(200)
    expect(reviewUnpublishResponseSchema.parse(response.json())).toEqual({
      reviewId: review.id,
      status: 'unpublished',
      closedReports: 3,
    })

    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after).toMatchObject({ status: 'unpublished', hiddenAt: null })
    const versions = await stack.db.db
      .select()
      .from(reviewVersions)
      .where(eq(reviewVersions.reviewId, review.id))
      .orderBy(reviewVersions.version)
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, 'approved'],
      [2, 'unpublished'],
    ])
    expect(versions[1]).toMatchObject({
      decidedBy: mod.user.id,
      decisionReason: 'Targets a reader.',
      body: BODY,
    })
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(book).toMatchObject({ reviewCount: 0, ratingSum: 0, ratingCounts: [0, 0, 0, 0, 0] })
    const rows = await stack.db.db.select().from(reviewReports)
    expect(rows.every((row) => row.status === 'actioned' && row.resolvedBy === mod.user.id)).toBe(
      true,
    )
    const [note] = await stack.db.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, author.user.id))
    expect(note).toMatchObject({
      type: 'review_unpublished',
      data: { reviewId: review.id, bookSlug: slug, reason: 'Targets a reader.' },
    })
    const [audit] = await stack.db.db.select().from(auditLog)
    expect(audit).toMatchObject({
      actorId: mod.user.id,
      action: 'review.unpublish',
      targetId: review.id,
      before: { status: 'approved' },
      after: { status: 'unpublished', reason: 'Targets a reader.', closedReports: 3 },
    })
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      name: 'email.send',
      payload: { template: 'review-decision', props: { decision: 'unpublished' } },
    })
  })

  it('skips the email when the author turned decision emails off', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { users } = await import('@reprint/db')
    await stack.db.db
      .update(users)
      .set({ emailReviewDecisions: false })
      .where(eq(users.id, author.user.id))
    const { review } = await reportedReview(author.user.id, 0)
    expect((await unpublish(review.id, mod.cookies, { reason: 'Spam.' })).statusCode).toBe(200)
    expect(enqueued).toHaveLength(0)
  })

  it('requires a reason and an Approved review that is not the moderator’s own', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review } = await reportedReview(author.user.id)
    const own = await reportedReview(mod.user.id)
    expect((await unpublish(review.id, mod.cookies)).statusCode).toBe(400)
    expect((await unpublish(review.id, mod.cookies, { reason: '   ' })).statusCode).toBe(400)
    expect((await unpublish(newId(), mod.cookies, { reason: 'x' })).statusCode).toBe(404)
    expect((await unpublish(own.review.id, mod.cookies, { reason: 'x' })).statusCode).toBe(403)
    expect((await unpublish(review.id, mod.cookies, { reason: 'x' })).statusCode).toBe(200)
    expect((await unpublish(review.id, mod.cookies, { reason: 'x' })).statusCode).toBe(409)
  })

  it('denies Members with 403 and Visitors with 401', async () => {
    const member = await person()
    const author = await person()
    const { review } = await reportedReview(author.user.id)
    expect((await unpublish(review.id, member.cookies, { reason: 'x' })).statusCode).toBe(403)
    expect((await unpublish(review.id, undefined, { reason: 'x' })).statusCode).toBe(401)
    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after?.status).toBe('approved')
  })
})

describe('GET /v1/mod/stats with reports', () => {
  it('counts open reports and the age of the oldest', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    await reportedReview(author.user.id, 2, 120)
    const closed = await reportedReview(author.user.id, 1, 600)
    await stack.db.db
      .update(reviewReports)
      .set({ status: 'dismissed' })
      .where(eq(reviewReports.reviewId, closed.review.id))

    const response = await app.inject({ method: 'GET', url: '/v1/mod/stats', cookies: mod.cookies })
    const body = modStatsSchema.parse(response.json())
    expect(body.openReportCount).toBe(2)
    expect(body.oldestOpenReportAgeSeconds).toBeGreaterThanOrEqual(7200)
    expect(body.oldestOpenReportAgeSeconds).toBeLessThan(7260)
  })
})

describe('GET /v1/mod/reviews reportedCount', () => {
  it('counts the reports filed on the reviewer’s Reviews', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    await reportedReview(author.user.id, 2)
    const bookId = newId()
    await stack.db.db
      .insert(books)
      .values({ id: bookId, slug: `book-${bookId.slice(-8)}`, title: 'B' })
    const [pending] = await stack.db.db
      .insert(reviews)
      .values({ userId: author.user.id, bookId, rating: 3, body: BODY })
      .returning()
    if (!pending) throw new Error('seed failed')
    await stack.db.db
      .insert(reviewVersions)
      .values({ reviewId: pending.id, version: 1, rating: 3, body: BODY })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/mod/reviews',
      cookies: mod.cookies,
    })
    const body = modQueueResponseSchema.parse(response.json())
    expect(body.items[0]?.reviewer.reportedCount).toBe(2)
  })
})
