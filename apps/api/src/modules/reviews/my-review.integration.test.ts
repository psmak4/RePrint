import { books, editions, newId, reviews, reviewVersions } from '@reprint/db'
import { deleteMyReviewResponseSchema, myReviewSchema, problemDetailsSchema } from '@reprint/shared'
import { asc, eq } from 'drizzle-orm'
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

async function member(options: { verified?: boolean } = {}) {
  const user = await createTestUser(stack.db.db, options)
  return { user, cookies: await signIn(user.id) }
}

async function newBook() {
  const id = newId()
  const slug = `book-${id.slice(-8)}`
  await stack.db.db.insert(books).values({ id, slug, title: 'A Book' })
  return { id, slug }
}

function put(slug: string, payload: unknown, cookies?: Record<string, string>) {
  return app.inject({
    method: 'PUT',
    url: `/v1/books/${slug}/my-review`,
    cookies,
    headers: { origin: ORIGIN },
    payload: payload as object,
  })
}

function get(slug: string, cookies?: Record<string, string>) {
  return app.inject({ method: 'GET', url: `/v1/books/${slug}/my-review`, cookies })
}

function remove(slug: string, cookies?: Record<string, string>) {
  return app.inject({
    method: 'DELETE',
    url: `/v1/books/${slug}/my-review`,
    cookies,
    headers: { origin: ORIGIN },
  })
}

async function totals(bookId: string) {
  const [row] = await stack.db.db
    .select({ count: books.reviewCount, sum: books.ratingSum, counts: books.ratingCounts })
    .from(books)
    .where(eq(books.id, bookId))
  return row
}

const input = { rating: 4, headline: 'Worth it', body: BODY, hasSpoilers: false }

describe('PUT /v1/books/:slug/my-review', () => {
  it('creates a Pending review with its first version', async () => {
    const { id, slug } = await newBook()
    const { cookies } = await member()

    const response = await put(slug, input, cookies)
    expect(response.statusCode).toBe(201)
    const review = myReviewSchema.parse(response.json())
    expect(review).toMatchObject({ rating: 4, headline: 'Worth it', status: 'pending' })

    const versions = await stack.db.db.select().from(reviewVersions)
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ reviewId: review.id, version: 1, status: 'pending' })
    // A Pending review is not in the public totals.
    expect(await totals(id)).toMatchObject({ count: 0, sum: 0 })
  })

  it('edits the existing review instead of creating a second, and appends a version', async () => {
    const { slug } = await newBook()
    const { cookies } = await member()
    await put(slug, input, cookies)

    const response = await put(slug, { ...input, rating: 2, headline: '' }, cookies)
    expect(response.statusCode).toBe(200)
    expect(myReviewSchema.parse(response.json())).toMatchObject({
      rating: 2,
      headline: null,
      status: 'pending',
    })
    expect(await stack.db.db.select().from(reviews)).toHaveLength(1)
    const versions = await stack.db.db
      .select()
      .from(reviewVersions)
      .orderBy(asc(reviewVersions.version))
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    expect(versions[1]?.rating).toBe(2)
  })

  it('hides an Approved review until re-approved, and drops it from the totals at once', async () => {
    const { id, slug } = await newBook()
    const { user, cookies } = await member()
    await put(slug, input, cookies)
    // A Moderator approves it (M4-T07 does this through the API; here we set the state directly).
    await stack.db.db.transaction(async (tx) => {
      await tx.update(reviews).set({ status: 'approved' }).where(eq(reviews.userId, user.id))
      await tx.update(books).set({ reviewCount: 1, ratingSum: 4, ratingCounts: [0, 0, 0, 1, 0] })
    })

    const response = await put(slug, { ...input, rating: 5 }, cookies)
    expect(myReviewSchema.parse(response.json()).status).toBe('pending')
    expect(await totals(id)).toEqual({ count: 0, sum: 0, counts: [0, 0, 0, 0, 0] })
  })

  it('sends a Rejected review back to Pending when it is edited', async () => {
    const { slug } = await newBook()
    const { user, cookies } = await member()
    await put(slug, input, cookies)
    await stack.db.db.update(reviews).set({ status: 'rejected' }).where(eq(reviews.userId, user.id))

    const response = await put(slug, input, cookies)
    expect(myReviewSchema.parse(response.json()).status).toBe('pending')
  })

  it('accepts an Edition of the Book and rejects one of another Book', async () => {
    const book = await newBook()
    const other = await newBook()
    const [mine] = await stack.db.db.insert(editions).values({ bookId: book.id }).returning()
    const [theirs] = await stack.db.db.insert(editions).values({ bookId: other.id }).returning()
    const { cookies } = await member()

    const ok = await put(book.slug, { ...input, editionId: mine?.id }, cookies)
    expect(myReviewSchema.parse(ok.json()).editionId).toBe(mine?.id)

    const bad = await put(book.slug, { ...input, editionId: theirs?.id }, cookies)
    expect(bad.statusCode).toBe(400)
    expect(problemDetailsSchema.parse(bad.json()).errors?.[0]?.path).toBe('body.editionId')
  })

  it('denies Visitors with 401 and unverified Members with 403, and validates the body', async () => {
    const { slug } = await newBook()
    expect((await put(slug, input)).statusCode).toBe(401)
    const unverified = await member({ verified: false })
    expect((await put(slug, input, unverified.cookies)).statusCode).toBe(403)
    expect(await stack.db.db.select().from(reviews)).toHaveLength(0)

    const { cookies } = await member()
    expect((await put(slug, { ...input, body: 'too short' }, cookies)).statusCode).toBe(400)
    expect((await put(slug, { ...input, rating: 6 }, cookies)).statusCode).toBe(400)
  })

  it('returns 404 for an unknown Book', async () => {
    const { cookies } = await member()
    expect((await put('no-such-book-000000', input, cookies)).statusCode).toBe(404)
  })

  it('refuses the 21st create or edit in a day with 429', async () => {
    const { slug } = await newBook()
    const { cookies } = await member()
    for (let i = 0; i < 20; i++) {
      expect((await put(slug, input, cookies)).statusCode).toBeLessThan(300)
    }
    const blocked = await put(slug, input, cookies)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.headers['retry-after']).toBeDefined()
  })
})

describe('GET /v1/books/:slug/my-review', () => {
  it('returns the viewer’s review, with the rejection reason once Rejected', async () => {
    const { slug } = await newBook()
    const { user, cookies } = await member()
    const created = myReviewSchema.parse((await put(slug, input, cookies)).json())

    const pending = await get(slug, cookies)
    expect(pending.statusCode).toBe(200)
    expect(myReviewSchema.parse(pending.json())).toMatchObject({
      id: created.id,
      status: 'pending',
    })

    await stack.db.db.update(reviews).set({ status: 'rejected' }).where(eq(reviews.userId, user.id))
    await stack.db.db
      .update(reviewVersions)
      .set({ status: 'rejected', decisionReason: 'Please remove the spoilers.' })
      .where(eq(reviewVersions.reviewId, created.id))
    const rejected = myReviewSchema.parse((await get(slug, cookies)).json())
    expect(rejected).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Please remove the spoilers.',
    })
  })

  it('denies Visitors, answers 404 without a review, and never shows another Member’s review', async () => {
    const { slug } = await newBook()
    const author = await member()
    await put(slug, input, author.cookies)

    expect((await get(slug)).statusCode).toBe(401)
    const reader = await member()
    expect((await get(slug, reader.cookies)).statusCode).toBe(404)
  })
})

describe('DELETE /v1/books/:slug/my-review', () => {
  it('deletes an Approved review permanently and updates the totals', async () => {
    const { id, slug } = await newBook()
    const { user, cookies } = await member()
    await put(slug, input, cookies)
    await stack.db.db.transaction(async (tx) => {
      await tx.update(reviews).set({ status: 'approved' }).where(eq(reviews.userId, user.id))
      await tx.update(books).set({ reviewCount: 1, ratingSum: 4, ratingCounts: [0, 0, 0, 1, 0] })
    })

    const response = await remove(slug, cookies)
    expect(response.statusCode).toBe(200)
    expect(deleteMyReviewResponseSchema.parse(response.json()).status).toBe('review_deleted')
    expect(await stack.db.db.select().from(reviews)).toHaveLength(0)
    expect(await stack.db.db.select().from(reviewVersions)).toHaveLength(0)
    expect(await totals(id)).toEqual({ count: 0, sum: 0, counts: [0, 0, 0, 0, 0] })
    expect((await get(slug, cookies)).statusCode).toBe(404)
  })

  it('denies Visitors, answers 404 without a review, and leaves another Member’s review alone', async () => {
    const { slug } = await newBook()
    const author = await member()
    await put(slug, input, author.cookies)

    expect((await remove(slug)).statusCode).toBe(401)
    const other = await member()
    expect((await remove(slug, other.cookies)).statusCode).toBe(404)
    expect(await stack.db.db.select().from(reviews)).toHaveLength(1)
  })
})
