import { books, reviews, users } from '@reprint/db'
import {
  discoverResponseSchema,
  REVIEW_EXCERPT_MAX,
  type ReviewStatus,
  searchResponseSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { buildJustApproved } from '../discover/rows.js'
import { loadTopReviews } from './excerpts.js'

const BODY = 'A thoughtful review that is comfortably longer than fifty characters.'
const DAY = 24 * 60 * 60 * 1000

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
  })
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
    catalog: { source: createStubSource(), interactive: (fn) => fn() },
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

const db = () => stack.db.db

async function makeBook(slug: string, title = slug) {
  const [book] = await db().insert(books).values({ slug, title }).returning()
  if (!book) throw new Error('book not stored')
  return book
}

interface ReviewOptions {
  status?: ReviewStatus
  hasSpoilers?: boolean
  hidden?: boolean
  helpfulCount?: number
  decidedDaysAgo?: number
  body?: string
  headline?: string
  rating?: number
  authorStatus?: 'active' | 'deleted'
}

async function makeReview(bookId: string, options: ReviewOptions = {}) {
  const author = await createTestUser(db(), { status: options.authorStatus })
  const [review] = await db()
    .insert(reviews)
    .values({
      userId: author.id,
      bookId,
      rating: options.rating ?? 4,
      headline: options.headline,
      body: options.body ?? BODY,
      status: options.status ?? 'approved',
      hasSpoilers: options.hasSpoilers ?? false,
      hiddenAt: options.hidden ? new Date() : null,
      helpfulCount: options.helpfulCount ?? 0,
      decidedAt: new Date(Date.now() - (options.decidedDaysAgo ?? 1) * DAY),
    })
    .returning()
  if (!review) throw new Error('review not stored')
  return { review, author }
}

describe('loadTopReviews', () => {
  it('never excerpts spoiler, auto-hidden, pending, rejected, unpublished, or deleted-author reviews', async () => {
    const book = await makeBook('ineligible')
    await makeReview(book.id, { hasSpoilers: true, helpfulCount: 9 })
    await makeReview(book.id, { hidden: true, helpfulCount: 9 })
    await makeReview(book.id, { status: 'pending', helpfulCount: 9 })
    await makeReview(book.id, { status: 'rejected', helpfulCount: 9 })
    await makeReview(book.id, { status: 'unpublished', helpfulCount: 9 })
    await makeReview(book.id, { authorStatus: 'deleted', helpfulCount: 9 })
    expect((await loadTopReviews(db(), [book.id])).size).toBe(0)
  })

  it('picks the most helpful eligible review, with ties going to the newest', async () => {
    const book = await makeBook('picked')
    await makeReview(book.id, { helpfulCount: 1, decidedDaysAgo: 1, body: `${BODY} one` })
    const winner = await makeReview(book.id, { helpfulCount: 5, decidedDaysAgo: 9 })
    await makeReview(book.id, { helpfulCount: 7, hasSpoilers: true })
    expect((await loadTopReviews(db(), [book.id])).get(book.id)?.id).toBe(winner.review.id)

    const tied = await makeBook('tied')
    await makeReview(tied.id, { helpfulCount: 2, decidedDaysAgo: 5 })
    const newest = await makeReview(tied.id, { helpfulCount: 2, decidedDaysAgo: 2 })
    await makeReview(tied.id, { helpfulCount: 2, decidedDaysAgo: 8 })
    expect((await loadTopReviews(db(), [tied.id])).get(tied.id)?.id).toBe(newest.review.id)
  })

  it('returns plain text of at most 200 characters, cut at a word boundary', async () => {
    const book = await makeBook('long')
    const body = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const { author } = await makeReview(book.id, { body, headline: 'Worth it', rating: 5 })
    const excerpt = (await loadTopReviews(db(), [book.id])).get(book.id)
    expect(excerpt?.excerpt.length).toBeLessThanOrEqual(REVIEW_EXCERPT_MAX)
    expect(excerpt?.excerpt.endsWith('…')).toBe(true)
    expect(excerpt?.headline).toBe('Worth it')
    expect(excerpt?.rating).toBe(5)
    expect(excerpt?.author).toEqual({ username: author.username, displayName: author.displayName })
  })
})

describe('buildJustApproved', () => {
  it('shows one excerpt per Book, newest first, and skips ineligible reviews', async () => {
    const newest = await makeReview((await makeBook('b1')).id, { decidedDaysAgo: 1 })
    const second = await makeBook('b2')
    await makeReview(second.id, { decidedDaysAgo: 3 })
    const secondNewest = await makeReview(second.id, { decidedDaysAgo: 2 })
    await makeReview((await makeBook('b3')).id, { decidedDaysAgo: 4 })
    await makeReview((await makeBook('b4')).id, { decidedDaysAgo: 0.1, hasSpoilers: true })
    await makeReview((await makeBook('b5')).id, { decidedDaysAgo: 0.1, status: 'pending' })
    await makeReview((await makeBook('b6')).id, { decidedDaysAgo: 0.1, hidden: true })

    const row = await buildJustApproved(db())
    expect(row?.map((item) => item.book.slug)).toEqual(['b1', 'b2', 'b3'])
    expect(row?.map((item) => item.review.id).slice(0, 2)).toEqual([
      newest.review.id,
      secondNewest.review.id,
    ])
  })

  it('is hidden under 3 items and holds at most 6', async () => {
    await makeReview((await makeBook('a1')).id)
    await makeReview((await makeBook('a2')).id)
    expect(await buildJustApproved(db())).toBeNull()
    for (let i = 3; i <= 8; i++) await makeReview((await makeBook(`a${i}`)).id)
    expect(await buildJustApproved(db())).toHaveLength(6)
  })

  it('leaves out a review whose author deleted their account', async () => {
    for (let i = 1; i <= 3; i++) await makeReview((await makeBook(`d${i}`)).id)
    const gone = await makeReview((await makeBook('gone')).id, { decidedDaysAgo: 0.1 })
    await db().update(users).set({ status: 'deleted' }).where(eq(users.id, gone.author.id))
    expect((await buildJustApproved(db()))?.map((item) => item.book.slug)).not.toContain('gone')
  })
})

describe('GET /v1/discover and GET /v1/search', () => {
  it('serve justApproved and topReview', async () => {
    for (let i = 1; i <= 3; i++) await makeReview((await makeBook(`row${i}`)).id)
    const discover = discoverResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/discover' })).json(),
    )
    expect(discover.justApproved).toHaveLength(3)

    const book = await makeBook('quartz-lantern', 'Quartz Lantern')
    const { review } = await makeReview(book.id, { helpfulCount: 3 })
    await makeBook('quartz-ember', 'Quartz Ember')
    const response = await app.inject({ method: 'GET', url: '/v1/search?q=quartz' })
    expect(response.statusCode, response.body).toBe(200)
    const items = searchResponseSchema.parse(response.json()).items
    const tops = new Map(
      items.flatMap((item) => (item.kind === 'book' ? [[item.book.slug, item.topReview]] : [])),
    )
    expect(tops.get('quartz-lantern')?.id).toBe(review.id)
    expect(tops.get('quartz-ember')).toBeNull()
  })
})
