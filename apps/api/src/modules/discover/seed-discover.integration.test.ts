import { createDb, createSeedRandom, resetDatabase, reviews } from '@reprint/db'
import { startTestDatabase, type TestDatabase } from '@reprint/db/testing'
import { and, desc, eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCatalog } from '../../catalog/seed-catalog.js'
import { recomputeRatings } from '../reviews/aggregates.js'
import { REVIEWS_SEED, seedReviews } from '../reviews/seed-reviews.js'
import {
  buildFeaturedGenres,
  buildFeaturedReview,
  buildMostReviewedThisMonth,
  buildRecentlyReviewed,
  buildTopRated,
  computeSiteMean,
} from './rows.js'
import { DISCOVER_SEED, seedDiscover } from './seed-discover.js'

let database: TestDatabase
let db: ReturnType<typeof createDb>['db']
let closeDb: () => Promise<void>

beforeAll(async () => {
  database = await startTestDatabase()
  await resetDatabase(database.url)
  const client = createDb(database.url)
  db = client.db
  closeDb = client.close
  await seedCatalog(db)
  await seedReviews(db, createSeedRandom(REVIEWS_SEED))
}, 120_000)
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})

describe('discover seed', () => {
  it('makes every Discover row visible and keeps Book totals consistent', async () => {
    const result = await seedDiscover(db, createSeedRandom(DISCOVER_SEED))
    expect(result.skipped).toBe(false)

    const now = new Date()
    expect(await buildRecentlyReviewed(db)).not.toBeNull()
    expect(await buildTopRated(db, await computeSiteMean(db))).not.toBeNull()
    expect(await buildMostReviewedThisMonth(db, now)).not.toBeNull()
    expect((await buildFeaturedGenres(db))?.length).toBeGreaterThan(0)
    expect((await buildFeaturedReview(db))?.review.helpfulCount).toBeGreaterThan(0)

    const recomputed = await recomputeRatings({ db, log: pino({ level: 'silent' }) })
    expect(recomputed.mismatches).toEqual([])
  })

  it('makes "Most helpful" order differ from "Newest" on a seeded Book', async () => {
    const featured = await buildFeaturedReview(db)
    const [row] = await db
      .select({ bookId: reviews.bookId })
      .from(reviews)
      .where(eq(reviews.id, featured?.review.id ?? ''))
    const approved = and(eq(reviews.bookId, row?.bookId ?? ''), eq(reviews.status, 'approved'))
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id)
    // The same orderings as GET /v1/books/:slug/reviews (`most_helpful` and `newest`).
    const helpful = ids(
      await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(approved)
        .orderBy(desc(reviews.helpfulCount), desc(reviews.submittedAt), desc(reviews.id)),
    )
    const newest = ids(
      await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(approved)
        .orderBy(desc(reviews.submittedAt), desc(reviews.id)),
    )
    expect(helpful).not.toEqual(newest)
  })

  it('does nothing when featured items already exist', async () => {
    const result = await seedDiscover(db, createSeedRandom(DISCOVER_SEED))
    expect(result).toMatchObject({ skipped: true, reviews: 0, helpfulVotes: 0 })
  })
})
