import { books, newId, reviewReports, reviews } from '@reprint/db'
import {
  bookReviewsResponseSchema,
  problemDetailsSchema,
  REPORT_AUTO_HIDE_THRESHOLD,
  type ReviewReportReason,
  type ReviewStatus,
  reviewReportResponseSchema,
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

async function member(options: { verified?: boolean } = {}) {
  const user = await createTestUser(stack.db.db, options)
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function newReview(status: ReviewStatus = 'approved', authorStatus?: 'deleted') {
  const author = await createTestUser(stack.db.db, authorStatus ? { status: authorStatus } : {})
  const bookId = newId()
  const slug = `book-${bookId.slice(-8)}`
  await stack.db.db.insert(books).values({ id: bookId, slug, title: 'A Book' })
  const [review] = await stack.db.db
    .insert(reviews)
    .values({ userId: author.id, bookId, rating: 5, body: BODY, status })
    .returning()
  if (!review) throw new Error('review not inserted')
  return { author, review, slug }
}

function report(
  id: string,
  cookies?: Record<string, string>,
  body: { reason: ReviewReportReason; note?: string } = { reason: 'spam' },
) {
  return app.inject({
    method: 'POST',
    url: `/v1/reviews/${id}/reports`,
    cookies,
    headers: { origin: ORIGIN },
    payload: body,
  })
}

async function stored(id: string) {
  const [row] = await stack.db.db.select().from(reviews).where(eq(reviews.id, id))
  return row
}

describe('POST /v1/reviews/:id/reports', () => {
  it('records a report from a verified Member on someone else’s Approved review', async () => {
    const { review } = await newReview()
    const reporter = await member()

    const response = await report(review.id, reporter.cookies, {
      reason: 'other',
      note: '  Targets another reader.  ',
    })
    expect(response.statusCode).toBe(200)
    expect(reviewReportResponseSchema.parse(response.json()).status).toBe('report_received')

    const rows = await stack.db.db.select().from(reviewReports)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      reviewId: review.id,
      reporterId: reporter.user.id,
      reason: 'other',
      note: 'Targets another reader.',
      status: 'open',
    })
    expect((await stored(review.id))?.hiddenAt).toBeNull()
  })

  it('requires a note for "other" and caps it at 500 characters', async () => {
    const { review } = await newReview()
    const reporter = await member()
    const missing = await report(review.id, reporter.cookies, { reason: 'other' })
    expect(missing.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(missing.json()).errors?.[0]?.path).toBe('body.note')
    const blank = await report(review.id, reporter.cookies, { reason: 'other', note: '   ' })
    expect(blank.statusCode).toBe(400)
    const long = await report(review.id, reporter.cookies, {
      reason: 'spam',
      note: 'x'.repeat(501),
    })
    expect(long.statusCode).toBe(400)
    const unknown = await report(review.id, reporter.cookies, { reason: 'rude' as never })
    expect(unknown.statusCode).toBe(400)
    expect(await stack.db.db.select().from(reviewReports)).toHaveLength(0)
  })

  it('denies Visitors, unverified Members, the author, and a second report', async () => {
    const { author, review } = await newReview()
    expect((await report(review.id)).statusCode).toBe(401)
    const unverified = await member({ verified: false })
    expect((await report(review.id, unverified.cookies)).statusCode).toBe(403)

    const started = await app.inject({ method: 'GET', url: `/test/start/${author.id}` })
    const own = await report(review.id, {
      [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
    })
    expect(own.statusCode).toBe(403)

    const reporter = await member()
    expect((await report(review.id, reporter.cookies)).statusCode).toBe(200)
    const again = await report(review.id, reporter.cookies, { reason: 'offensive' })
    expect(again.statusCode).toBe(409)
    expect(problemDetailsSchema.parse(again.json()).status).toBe(409)
    expect(await stack.db.db.select().from(reviewReports)).toHaveLength(1)
  })

  it('answers 404 for reviews that are not public', async () => {
    const reporter = await member()
    for (const status of ['pending', 'rejected', 'unpublished'] as const) {
      const hidden = await newReview(status)
      expect((await report(hidden.review.id, reporter.cookies)).statusCode).toBe(404)
    }
    const erased = await newReview('approved', 'deleted')
    expect((await report(erased.review.id, reporter.cookies)).statusCode).toBe(404)
    expect((await report(newId(), reporter.cookies)).statusCode).toBe(404)
    expect(await stack.db.db.select().from(reviewReports)).toHaveLength(0)
  })

  it('hides the review from public lists at the 3rd open report, keeping the rating', async () => {
    const { author, review, slug } = await newReview()
    await stack.db.db
      .update(books)
      .set({ reviewCount: 1, ratingSum: 5, ratingCounts: [0, 0, 0, 0, 1] })
      .where(eq(books.id, review.bookId))

    for (let i = 1; i < REPORT_AUTO_HIDE_THRESHOLD; i++) {
      const reporter = await member()
      expect((await report(review.id, reporter.cookies)).statusCode).toBe(200)
      expect((await stored(review.id))?.hiddenAt).toBeNull()
    }
    const list = () => app.inject({ method: 'GET', url: `/v1/books/${slug}/reviews` })
    expect(bookReviewsResponseSchema.parse((await list()).json()).items).toHaveLength(1)

    const third = await member()
    expect((await report(review.id, third.cookies)).statusCode).toBe(200)
    const row = await stored(review.id)
    expect(row?.hiddenAt).toBeInstanceOf(Date)
    expect(row?.status).toBe('approved')
    expect(bookReviewsResponseSchema.parse((await list()).json()).items).toHaveLength(0)
    const profile = await app.inject({ method: 'GET', url: `/v1/users/${author.username}/reviews` })
    expect(profile.json().items).toHaveLength(0)

    // D-046: hiding does not change the Book's rating until a Moderator unpublishes.
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, review.bookId))
    expect(book).toMatchObject({ reviewCount: 1, ratingSum: 5 })
  })

  it('returns 429 on the 21st report in a day', async () => {
    const reporter = await member()
    for (let i = 0; i < 20; i++) {
      const { review } = await newReview()
      expect((await report(review.id, reporter.cookies)).statusCode).toBe(200)
    }
    const { review } = await newReview()
    const limited = await report(review.id, reporter.cookies)
    expect(limited.statusCode).toBe(429)
    expect(limited.headers['retry-after']).toBeDefined()
  })
})
