import { createDb, createSeedRandom, resetDatabase, reviews, reviewVersions } from '@reprint/db'
import { startTestDatabase, type TestDatabase } from '@reprint/db/testing'
import { asc, eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCatalog } from '../../catalog/seed-catalog.js'
import { recomputeRatings } from './aggregates.js'
import { REVIEWS_SEED, seedReviews } from './seed-reviews.js'

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
}, 120_000)
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})

describe('review seed', () => {
  it('seeds every status, edited reviews with versions, and consistent aggregates', async () => {
    const result = await seedReviews(db, createSeedRandom(REVIEWS_SEED))
    expect(result.skipped).toBe(false)

    const rows = await db.select().from(reviews)
    const statuses = new Set(rows.map((r) => r.status))
    expect([...statuses].sort()).toEqual(['approved', 'pending', 'rejected', 'unpublished'])

    const versions = await db
      .select()
      .from(reviewVersions)
      .orderBy(asc(reviewVersions.reviewId), asc(reviewVersions.version))
    const decided = versions.filter((v) => v.status === 'rejected')
    expect(decided.some((v) => v.decisionReason)).toBe(true)
    expect(decided.some((v) => !v.decisionReason)).toBe(true)
    const perReview = Map.groupBy(versions, (v) => v.reviewId)
    expect([...perReview.values()].some((list) => list.length > 1)).toBe(true)
    // The Review always carries its latest version's content.
    for (const review of rows) {
      const latest = perReview.get(review.id)?.at(-1)
      expect(latest?.body).toBe(review.body)
    }

    const recomputed = await recomputeRatings({ db, log: pino({ level: 'silent' }) })
    expect(recomputed.mismatches).toEqual([])
  })

  it('does nothing when reviews already exist', async () => {
    const before = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.status, 'approved'))
    const result = await seedReviews(db, createSeedRandom(REVIEWS_SEED))
    expect(result).toEqual({ reviews: 0, versions: 0, skipped: true })
    const after = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.status, 'approved'))
    expect(after).toHaveLength(before.length)
  })
})
