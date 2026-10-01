import { books, newId, reviewClaims, reviews, reviewVersions } from '@reprint/db'
import {
  claimReviewResponseSchema,
  modQueueResponseSchema,
  modStatsSchema,
  problemDetailsSchema,
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

async function signIn(userId: string) {
  const started = await app.inject({ method: 'GET', url: `/test/start/${userId}` })
  return { [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '' }
}

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  return { user, cookies: await signIn(user.id) }
}

async function newBook() {
  const id = newId()
  await stack.db.db.insert(books).values({ id, slug: `book-${id.slice(-8)}`, title: 'A Book' })
  return { id, slug: `book-${id.slice(-8)}` }
}

/** A Review with its version rows; `minutesAgo` sets the order in the queue. */
async function seedReview(
  userId: string,
  bookId: string,
  options: { status?: 'pending' | 'approved' | 'rejected'; minutesAgo?: number } = {},
) {
  const status = options.status ?? 'pending'
  const submittedAt = new Date(Date.now() - (options.minutesAgo ?? 1) * 60_000)
  const [review] = await stack.db.db
    .insert(reviews)
    .values({ userId, bookId, rating: 4, body: BODY, status, submittedAt })
    .returning()
  if (!review) throw new Error('seed failed')
  await stack.db.db
    .insert(reviewVersions)
    .values({ reviewId: review.id, version: 1, rating: 4, body: BODY, status })
  return review
}

const queue = (cookies?: Record<string, string>, query = '') =>
  app.inject({ method: 'GET', url: `/v1/mod/reviews${query}`, cookies })
const claim = (id: string, cookies?: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: `/v1/mod/reviews/${id}/claim`,
    cookies,
    headers: { origin: ORIGIN },
  })
const stats = (cookies?: Record<string, string>) =>
  app.inject({ method: 'GET', url: '/v1/mod/stats', cookies })

describe('GET /v1/mod/reviews', () => {
  it('lists Pending reviews oldest first', async () => {
    const mod = await person(['moderator'])
    const book = await newBook()
    const [a, b, c] = await Promise.all([person(), person(), person()])
    const newer = await seedReview(a.user.id, book.id, { minutesAgo: 5 })
    const oldest = await seedReview(b.user.id, book.id, { minutesAgo: 30 })
    await seedReview(c.user.id, book.id, { status: 'approved', minutesAgo: 60 })

    const response = await queue(mod.cookies)
    expect(response.statusCode).toBe(200)
    const body = modQueueResponseSchema.parse(response.json())
    expect(body.items.map((item) => item.id)).toEqual([oldest.id, newer.id])
    expect(body.meta.nextCursor).toBeNull()
    expect(body.items[0]).toMatchObject({ book: { slug: book.slug }, version: 1, claim: null })
  })

  it('pages with an opaque cursor without repeating or skipping', async () => {
    const mod = await person(['moderator'])
    const book = await newBook()
    const ids: string[] = []
    for (const minutesAgo of [50, 40, 30, 20, 10]) {
      const author = await person()
      ids.push((await seedReview(author.user.id, book.id, { minutesAgo })).id)
    }
    const first = modQueueResponseSchema.parse((await queue(mod.cookies, '?limit=2')).json())
    expect(first.items.map((i) => i.id)).toEqual(ids.slice(0, 2))
    expect(first.meta.nextCursor).toEqual(expect.any(String))
    const second = modQueueResponseSchema.parse(
      (await queue(mod.cookies, `?limit=2&cursor=${first.meta.nextCursor}`)).json(),
    )
    expect(second.items.map((i) => i.id)).toEqual(ids.slice(2, 4))
    const third = modQueueResponseSchema.parse(
      (await queue(mod.cookies, `?limit=2&cursor=${second.meta.nextCursor}`)).json(),
    )
    expect(third.items.map((i) => i.id)).toEqual(ids.slice(4))
    expect(third.meta.nextCursor).toBeNull()
  })

  it('rejects a malformed cursor with 400', async () => {
    const mod = await person(['moderator'])
    const response = await queue(mod.cookies, '?cursor=not-a-cursor')
    expect(response.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(400)
  })

  it("shows the reviewer's history and the last approved version of an edited review", async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const [bookA, bookB, bookC] = await Promise.all([newBook(), newBook(), newBook()])
    await seedReview(author.user.id, bookA.id, { status: 'approved' })
    await seedReview(author.user.id, bookB.id, { status: 'rejected' })
    // An edited review: version 1 was approved, version 2 is waiting.
    const edited = await seedReview(author.user.id, bookC.id, { status: 'approved' })
    await stack.db.db
      .update(reviews)
      .set({ status: 'pending', rating: 2, body: `${BODY} Edited.` })
      .where(eq(reviews.id, edited.id))
    await stack.db.db.insert(reviewVersions).values({
      reviewId: edited.id,
      version: 2,
      rating: 2,
      body: `${BODY} Edited.`,
      status: 'pending',
    })

    const body = modQueueResponseSchema.parse((await queue(mod.cookies)).json())
    expect(body.items).toHaveLength(1)
    const [item] = body.items
    expect(item).toMatchObject({
      version: 2,
      rating: 2,
      reviewer: {
        username: author.user.username,
        approvedCount: 2,
        rejectedCount: 1,
        reportedCount: 0,
      },
      lastApproved: { rating: 4, body: BODY },
    })
  })

  it('leaves out the moderator’s own reviews', async () => {
    const mod = await person(['moderator'])
    const book = await newBook()
    await seedReview(mod.user.id, book.id)
    expect(modQueueResponseSchema.parse((await queue(mod.cookies)).json()).items).toEqual([])
  })

  it('denies Members with 403 and Visitors with 401 on every route', async () => {
    const member = await person()
    const author = await person()
    const book = await newBook()
    const review = await seedReview(author.user.id, book.id)
    const id = review.id
    for (const request of [
      (c?: Record<string, string>) => queue(c),
      (c?: Record<string, string>) => claim(id, c),
      (c?: Record<string, string>) => stats(c),
    ]) {
      const denied = await request(member.cookies)
      expect(denied.statusCode).toBe(403)
      expect(problemDetailsSchema.parse(denied.json()).status).toBe(403)
      expect((await request()).statusCode).toBe(401)
    }
    expect(await stack.db.db.select().from(reviewClaims)).toEqual([])
  })
})

describe('POST /v1/mod/reviews/:id/claim', () => {
  it('claims a Pending review for 10 minutes', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const book = await newBook()
    const review = await seedReview(author.user.id, book.id)

    const before = Date.now()
    const response = await claim(review.id, mod.cookies)
    expect(response.statusCode).toBe(200)
    const body = claimReviewResponseSchema.parse(response.json())
    const minutes = (new Date(body.expiresAt).getTime() - before) / 60_000
    expect(minutes).toBeGreaterThan(9.9)
    expect(minutes).toBeLessThan(10.2)

    const listed = modQueueResponseSchema.parse((await queue(mod.cookies)).json())
    expect(listed.items[0]?.claim).toMatchObject({ mine: true })
  })

  it('returns 409 for another Moderator until the claim expires, and lets the owner renew', async () => {
    const first = await person(['moderator'])
    const second = await person(['admin'])
    const author = await person()
    const book = await newBook()
    const review = await seedReview(author.user.id, book.id)

    expect((await claim(review.id, first.cookies)).statusCode).toBe(200)
    const blocked = await claim(review.id, second.cookies)
    expect(blocked.statusCode).toBe(409)
    expect(problemDetailsSchema.parse(blocked.json()).status).toBe(409)
    const seen = modQueueResponseSchema.parse((await queue(second.cookies)).json())
    expect(seen.items[0]?.claim).toMatchObject({ mine: false })
    expect((await claim(review.id, first.cookies)).statusCode).toBe(200)

    await stack.db.db
      .update(reviewClaims)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(reviewClaims.reviewId, review.id))
    const afterExpiry = modQueueResponseSchema.parse((await queue(second.cookies)).json())
    expect(afterExpiry.items[0]?.claim).toBeNull()
    expect((await claim(review.id, second.cookies)).statusCode).toBe(200)
    const [row] = await stack.db.db.select().from(reviewClaims)
    expect(row?.moderatorId).toBe(second.user.id)
  })

  it('returns 404 for an unknown review, 409 when not Pending, and 403 for your own', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const book = await newBook()
    const approved = await seedReview(author.user.id, book.id, { status: 'approved' })
    const [otherBook] = await Promise.all([newBook()])
    const own = await seedReview(mod.user.id, otherBook.id)

    expect((await claim(newId(), mod.cookies)).statusCode).toBe(404)
    expect((await claim(approved.id, mod.cookies)).statusCode).toBe(409)
    expect((await claim(own.id, mod.cookies)).statusCode).toBe(403)
    expect((await claim('not-a-uuid', mod.cookies)).statusCode).toBe(400)
  })
})

describe('GET /v1/mod/stats', () => {
  it('reports the pending count and the age of the oldest', async () => {
    const mod = await person(['moderator'])
    const book = await newBook()
    const [a, b, c] = await Promise.all([person(), person(), person()])
    await seedReview(a.user.id, book.id, { minutesAgo: 10 })
    await seedReview(b.user.id, book.id, { minutesAgo: 120 })
    await seedReview(c.user.id, book.id, { status: 'approved', minutesAgo: 600 })

    const response = await stats(mod.cookies)
    expect(response.statusCode).toBe(200)
    const body = modStatsSchema.parse(response.json())
    expect(body.pendingCount).toBe(2)
    expect(body.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(7200)
    expect(body.oldestPendingAgeSeconds).toBeLessThan(7260)
  })

  it('returns nulls when nothing is pending', async () => {
    const mod = await person(['moderator'])
    const body = modStatsSchema.parse((await stats(mod.cookies)).json())
    expect(body).toEqual({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null })
  })
})
