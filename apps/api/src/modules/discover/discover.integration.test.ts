import { books, featuredItems, genres, newId, reviews } from '@reprint/db'
import { discoverResponseSchema, type ReviewStatus } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { jobs } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'

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

const db = () => stack.db.db

/** A Book whose cached totals match the Approved reviews inserted for it. */
async function makeBook(
  slug: string,
  ratings: number[],
  options: { decidedDaysAgo?: number; status?: ReviewStatus } = {},
) {
  const { decidedDaysAgo = 1, status = 'approved' } = options
  const [book] = await db()
    .insert(books)
    .values({
      slug,
      title: slug,
      reviewCount: status === 'approved' ? ratings.length : 0,
      ratingSum: status === 'approved' ? ratings.reduce((a, b) => a + b, 0) : 0,
    })
    .returning()
  if (!book) throw new Error('book not stored')
  const reviewIds: string[] = []
  for (const rating of ratings) {
    const author = await createTestUser(db())
    const [review] = await db()
      .insert(reviews)
      .values({
        userId: author.id,
        bookId: book.id,
        rating,
        body: BODY,
        status,
        decidedAt: new Date(Date.now() - decidedDaysAgo * DAY),
      })
      .returning()
    if (!review) throw new Error('review not stored')
    reviewIds.push(review.id)
  }
  return { book, reviewIds }
}

/** Six Books, each with five Approved reviews; `s0` is rated highest. */
async function fillCatalog() {
  const made = []
  for (let i = 0; i < 6; i++) {
    const rating = i === 0 ? 5 : 4
    made.push(await makeBook(`s${i}`, Array<number>(5).fill(rating), { decidedDaysAgo: i + 1 }))
  }
  return made
}

async function discover() {
  const response = await app.inject({ method: 'GET', url: '/v1/discover' })
  expect(response.statusCode).toBe(200)
  return { response, body: discoverResponseSchema.parse(response.json()) }
}

async function rebuild() {
  await jobs['discover.rebuild'].handler(
    {},
    {
      log: pino({ level: 'silent' }),
      db: db(),
      redis: stack.redis,
      mailer: undefined as never,
      storage: undefined as never,
      catalog: undefined as never,
      queue: undefined as never,
      sourceRps: 2,
      alert: () => {},
    },
  )
}

describe('GET /v1/discover', () => {
  it('builds every Book row from approved reviews, one card per Book', async () => {
    await fillCatalog()
    const { response, body } = await discover()
    // Newest decision first; each Book once even with five reviews.
    expect(body.recentlyReviewed?.map((book) => book.slug)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ])
    // Weighted rating: the 5-star Book first, ties by Book ID order after that.
    expect(body.topRated?.[0]?.slug).toBe('s0')
    expect(body.topRated).toHaveLength(6)
    expect(body.mostReviewedThisMonth).toHaveLength(6)
    expect(response.headers['cache-control']).toContain('public')
  })

  it('leaves Books under 5 approved reviews out of Top rated', async () => {
    await fillCatalog()
    await makeBook('few', [5, 5, 5, 5])
    const { body } = await discover()
    expect(body.topRated?.map((book) => book.slug)).not.toContain('few')
    expect(body.recentlyReviewed?.map((book) => book.slug)).toContain('few')
  })

  it('counts only the last 30 days in Most reviewed this month', async () => {
    await fillCatalog()
    await makeBook('old', [5, 5, 5, 5, 5, 5, 5, 5], { decidedDaysAgo: 45 })
    const { body } = await discover()
    expect(body.mostReviewedThisMonth?.map((book) => book.slug)).not.toContain('old')
    expect(body.topRated?.map((book) => book.slug)).toContain('old')
  })

  it('ignores reviews that are not approved', async () => {
    await fillCatalog()
    await makeBook('pending', [5, 5, 5, 5, 5], { status: 'pending' })
    const { body } = await discover()
    const all = [body.recentlyReviewed, body.topRated, body.mostReviewedThisMonth]
    for (const row of all) expect(row?.map((book) => book.slug)).not.toContain('pending')
  })

  it('hides every row with fewer than 6 Books', async () => {
    for (let i = 0; i < 5; i++) await makeBook(`t${i}`, Array<number>(5).fill(4))
    const { body } = await discover()
    expect(body).toMatchObject({
      recentlyReviewed: null,
      topRated: null,
      mostReviewedThisMonth: null,
      featuredGenres: null,
      featuredReview: null,
    })
    expect(body.justApproved).toHaveLength(5)

    await stack.reset()
    await stack.redis.flushall()
    for (let i = 0; i < 2; i++) await makeBook(`u${i}`, [4])
    expect((await discover()).body.justApproved).toBeNull()
  })

  it('shows picked Genres in order and the featured review with its Book', async () => {
    const { reviewIds } = (await fillCatalog())[0] ?? { reviewIds: [] }
    const [fantasy, memoir] = await db()
      .insert(genres)
      .values([
        { slug: 'zz-fantasy', name: 'Fantasy' },
        { slug: 'zz-memoir', name: 'Memoir' },
      ])
      .returning()
    if (!fantasy || !memoir || !reviewIds[0]) throw new Error('fixtures missing')
    await db()
      .insert(featuredItems)
      .values([
        { kind: 'genre', refId: memoir.id, position: 0 },
        { kind: 'genre', refId: fantasy.id, position: 1 },
        { kind: 'genre', refId: newId(), position: 2 }, // a Genre that no longer exists
        { kind: 'review', refId: reviewIds[0] },
      ])
    const { body } = await discover()
    expect(body.featuredGenres).toEqual([
      { slug: 'zz-memoir', name: 'Memoir' },
      { slug: 'zz-fantasy', name: 'Fantasy' },
    ])
    expect(body.featuredReview?.review.id).toBe(reviewIds[0])
    expect(body.featuredReview?.book.slug).toBe('s0')
  })

  it('drops a featured review that is no longer approved', async () => {
    const { reviewIds } = (await fillCatalog())[0] ?? { reviewIds: [] }
    if (!reviewIds[0]) throw new Error('fixtures missing')
    await db().insert(featuredItems).values({ kind: 'review', refId: reviewIds[0] })
    await db().update(reviews).set({ status: 'unpublished' }).where(eq(reviews.id, reviewIds[0]))
    expect((await discover()).body.featuredReview).toBeNull()
  })

  it('serves from the cache until the discover.rebuild job runs', async () => {
    await fillCatalog()
    expect((await discover()).body.recentlyReviewed).toHaveLength(6)
    await makeBook('late', [5])
    expect((await discover()).body.recentlyReviewed?.map((book) => book.slug)).not.toContain('late')
    await rebuild()
    expect((await discover()).body.recentlyReviewed?.map((book) => book.slug)).toContain('late')
    // One key per row, plus the cached site mean.
    expect((await stack.redis.keys('discover:v2:*')).sort()).toEqual([
      'discover:v2:row:featuredGenres',
      'discover:v2:row:featuredReview',
      'discover:v2:row:justApproved',
      'discover:v2:row:mostReviewedThisMonth',
      'discover:v2:row:recentlyReviewed',
      'discover:v2:row:topRated',
      'discover:v2:site-mean',
    ])
  })

  it('rebuilds on a miss when the cache has been flushed', async () => {
    await fillCatalog()
    await discover()
    await stack.redis.flushall()
    await makeBook('fresh', [5])
    expect((await discover()).body.recentlyReviewed?.map((book) => book.slug)).toContain('fresh')
  })
})

describe('discover.rebuild job', () => {
  it('runs every 10 minutes', () => {
    expect(jobs['discover.rebuild'].schedule?.everyMs).toBe(10 * 60 * 1000)
  })
})

// Last, because it stops Redis for the rest of the file.
describe('GET /v1/discover without Redis', () => {
  it('still builds the page from the Catalog', async () => {
    await fillCatalog()
    await stack.stopRedis()
    expect((await discover()).body.recentlyReviewed).toHaveLength(6)
  })
})
