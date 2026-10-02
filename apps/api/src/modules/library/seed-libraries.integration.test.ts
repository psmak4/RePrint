import {
  createDb,
  createSeedRandom,
  resetDatabase,
  reviews,
  shelfEntries,
  users,
} from '@reprint/db'
import { startTestDatabase, type TestDatabase } from '@reprint/db/testing'
import { SHELVES } from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedCatalog } from '../../catalog/seed-catalog.js'
import { REVIEWS_SEED, seedReviews } from '../reviews/seed-reviews.js'
import { LIBRARIES_SEED, seedLibraries } from './seed-libraries.js'

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

describe('library seed', () => {
  it('fills all three Shelves, with some private Libraries', async () => {
    const result = await seedLibraries(db, createSeedRandom(LIBRARIES_SEED))
    expect(result.skipped).toBe(false)

    const entries = await db.select().from(shelfEntries)
    expect(entries.length).toBe(result.entries)
    expect(new Set(entries.map((entry) => entry.shelf))).toEqual(new Set(SHELVES))

    const ownerIds = [...new Set(entries.map((entry) => entry.userId))]
    const owners = await db
      .select({ id: users.id, libraryPublic: users.libraryPublic })
      .from(users)
      .where(inArray(users.id, ownerIds))
    expect(owners.some((owner) => !owner.libraryPublic)).toBe(true)
    expect(owners.some((owner) => owner.libraryPublic)).toBe(true)
  })

  it('shelves Books the owner reviewed and Books they did not', async () => {
    const entries = await db.select().from(shelfEntries)
    let withReview = 0
    let withoutReview = 0
    for (const entry of entries) {
      const [review] = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(and(eq(reviews.userId, entry.userId), eq(reviews.bookId, entry.bookId)))
      if (review) withReview++
      else withoutReview++
    }
    expect(withReview).toBeGreaterThan(0)
    expect(withoutReview).toBeGreaterThan(0)
  })

  it('does nothing when Shelf entries already exist', async () => {
    const result = await seedLibraries(db, createSeedRandom(LIBRARIES_SEED))
    expect(result).toMatchObject({ skipped: true, entries: 0 })
  })
})
