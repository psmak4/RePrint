import { books, newId, reviews } from '@reprint/db'
import {
  bookDetailSchema,
  bookReviewsResponseSchema,
  problemDetailsSchema,
  type ReviewStatus,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { applyReviewChange } from './aggregates.js'

const stub = createStubSource()
const BODY = 'A thoughtful review that is comfortably longer than fifty characters.'

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

async function newBook() {
  const id = newId()
  const slug = `book-${id.slice(-8)}`
  await stack.db.db.insert(books).values({ id, slug, title: 'A Book' })
  return { id, slug }
}

/** A Book with an Author, so the detail response is complete. */
async function ingestDune() {
  const candidate = await stub.getBook('stub-book-dune')
  const author = await stub.getAuthor('stub-author-herbert')
  if (!candidate || !author) throw new Error('missing stub data')
  const { bookId, slug } = await ingestBook(stack.db.db, {
    source: stub,
    candidate,
    authorRecords: new Map([['stub-author-herbert', author]]),
  })
  return { id: bookId, slug }
}

interface SeedReview {
  rating: number
  status?: ReviewStatus
  helpfulCount?: number
  /** Days before now it was submitted. */
  daysAgo?: number
  userStatus?: 'active' | 'deleted'
}

/** Inserts a review the way a Moderator's decision leaves it, keeping the Book's totals in step. */
async function seed(bookId: string, options: SeedReview) {
  const user = await createTestUser(stack.db.db, { status: options.userStatus })
  const status = options.status ?? 'approved'
  const [review] = await stack.db.db
    .insert(reviews)
    .values({
      userId: user.id,
      bookId,
      rating: options.rating,
      body: BODY,
      headline: `Headline ${options.rating}`,
      status,
      helpfulCount: options.helpfulCount ?? 0,
      submittedAt: new Date(Date.now() - (options.daysAgo ?? 0) * 86_400_000),
    })
    .returning()
  if (!review) throw new Error('failed to insert review')
  if (options.userStatus !== 'deleted') {
    await stack.db.db.transaction((tx) =>
      applyReviewChange(tx, bookId, null, { status, rating: options.rating }),
    )
  }
  return { user, review }
}

function list(slug: string, query = '') {
  return app.inject({ method: 'GET', url: `/v1/books/${slug}/reviews${query}` })
}

describe('GET /v1/books/:slug/reviews', () => {
  it('lists Approved reviews only, with the author and no internal fields', async () => {
    const { id, slug } = await newBook()
    const approved = await seed(id, { rating: 5 })
    await seed(id, { rating: 1, status: 'pending' })
    await seed(id, { rating: 2, status: 'rejected' })
    await seed(id, { rating: 3, status: 'unpublished' })
    await seed(id, { rating: 4, userStatus: 'deleted' })

    const response = await list(slug)
    expect(response.statusCode).toBe(200)
    const body = bookReviewsResponseSchema.parse(response.json())
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      id: approved.review.id,
      rating: 5,
      hasSpoilers: false,
      author: { username: approved.user.username, displayName: approved.user.displayName },
    })
    expect(body.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 })
    expect(JSON.stringify(response.json())).not.toContain(approved.user.email)
  })

  it('sorts by most helpful (ties newest first), newest, highest, and lowest', async () => {
    const { id, slug } = await newBook()
    const a = await seed(id, { rating: 3, helpfulCount: 5, daysAgo: 10 })
    const b = await seed(id, { rating: 5, helpfulCount: 5, daysAgo: 1 })
    const c = await seed(id, { rating: 1, helpfulCount: 0, daysAgo: 0 })
    const d = await seed(id, { rating: 5, helpfulCount: 2, daysAgo: 5 })
    const ids = async (query: string) =>
      bookReviewsResponseSchema.parse((await list(slug, query)).json()).items.map((r) => r.id)

    // helpful: a and b tie on 5 (b is newer), then d, then c.
    expect(await ids('')).toEqual([b, a, d, c].map((x) => x.review.id))
    expect(await ids('?sort=most_helpful')).toEqual([b, a, d, c].map((x) => x.review.id))
    expect(await ids('?sort=newest')).toEqual([c, b, d, a].map((x) => x.review.id))
    // highest: b (1 day) before d (5 days) on the tie.
    expect(await ids('?sort=highest')).toEqual([b, d, a, c].map((x) => x.review.id))
    expect(await ids('?sort=lowest')).toEqual([c, a, b, d].map((x) => x.review.id))
  })

  it('filters by star rating', async () => {
    const { id, slug } = await newBook()
    await seed(id, { rating: 5 })
    await seed(id, { rating: 5 })
    await seed(id, { rating: 2 })

    const body = bookReviewsResponseSchema.parse((await list(slug, '?rating=5')).json())
    expect(body.items.map((r) => r.rating)).toEqual([5, 5])
    expect(body.meta.total).toBe(2)
    const none = bookReviewsResponseSchema.parse((await list(slug, '?rating=4')).json())
    expect(none.items).toEqual([])
    expect(none.meta).toMatchObject({ total: 0, totalPages: 0 })
  })

  it('pages ten at a time without repeating or skipping reviews', async () => {
    const { id, slug } = await newBook()
    for (let i = 0; i < 12; i++) await seed(id, { rating: 4, daysAgo: i })

    const first = bookReviewsResponseSchema.parse((await list(slug, '?sort=newest')).json())
    const second = bookReviewsResponseSchema.parse((await list(slug, '?sort=newest&page=2')).json())
    expect(first.items).toHaveLength(10)
    expect(second.items).toHaveLength(2)
    expect(second.meta).toEqual({ page: 2, pageSize: 10, total: 12, totalPages: 2 })
    const all = [...first.items, ...second.items].map((r) => r.id)
    expect(new Set(all).size).toBe(12)
  })

  it('is public and cacheable, and answers 304 to a matching ETag', async () => {
    const { id, slug } = await newBook()
    await seed(id, { rating: 4 })
    const first = await list(slug)
    expect(first.statusCode).toBe(200)
    expect(first.headers['cache-control']).toContain('stale-while-revalidate')
    const etag = String(first.headers.etag)
    expect(etag).not.toBe('')
    const again = await app.inject({
      method: 'GET',
      url: `/v1/books/${slug}/reviews`,
      headers: { 'if-none-match': etag },
    })
    expect(again.statusCode).toBe(304)
  })

  it('returns 404 Problem Details for an unknown Book and 400 for a bad query', async () => {
    const missing = await list('no-such-book-abc123')
    expect(missing.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(missing.json()).status).toBe(404)
    const { slug } = await newBook()
    for (const query of ['?sort=oldest', '?rating=6', '?page=0']) {
      expect((await list(slug, query)).statusCode).toBe(400)
    }
  })
})

describe('GET /v1/books/:slug rating summary', () => {
  it('counts Approved reviews only, with a one-decimal average and 5-bar distribution', async () => {
    const { id, slug } = await ingestDune()
    await seed(id, { rating: 5 })
    await seed(id, { rating: 4 })
    await seed(id, { rating: 4 })
    await seed(id, { rating: 1, status: 'pending' })
    await seed(id, { rating: 1, status: 'rejected' })

    const response = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
    expect(bookDetailSchema.parse(response.json()).rating).toEqual({
      average: 4.3,
      count: 3,
      distribution: [0, 0, 0, 2, 1],
    })
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, id))
    expect(row?.reviewCount).toBe(3)
  })
})
