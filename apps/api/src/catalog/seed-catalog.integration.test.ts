import {
  authors,
  bookGenres,
  books,
  createDb,
  editions,
  genres,
  mergeCandidates,
  series,
} from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { bookDetailSchema } from '@reprint/shared'
import { count } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadBookDetail } from '../modules/catalog/read.js'
import { seedCatalog } from './seed-catalog.js'

let database: TestDatabase
let db: ReturnType<typeof createDb>['db']
let closeDb: () => Promise<void>

beforeAll(async () => {
  database = await startTestDatabase()
  const client = createDb(database.url)
  db = client.db
  closeDb = client.close
  await truncateAllTables(database.sql)
})
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})

async function totals() {
  const tables = { books, editions, authors, series, mergeCandidates }
  const result: Record<string, number> = {}
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ n: count() }).from(table)
    result[name] = row?.n ?? 0
  }
  return result
}

describe('seedCatalog', () => {
  it('loads about 500 Books with Editions, Authors, Series, and every Genre, and is idempotent', async () => {
    const first = await seedCatalog(db)
    expect(first.books).toBe(500)
    expect(first.created).toBe(500)
    const after = await totals()
    expect(after.books).toBe(500)
    expect(after.editions).toBeGreaterThan(1000)
    expect(after.authors).toBeGreaterThan(100)
    expect(after.series).toBeGreaterThan(20)
    expect(after.mergeCandidates).toBe(3)

    const [allGenres] = await db.select({ n: count() }).from(genres)
    const [usedGenres] = await db
      .select({ n: count(bookGenres.genreId) })
      .from(bookGenres)
      .groupBy(bookGenres.genreId)
      .then((rows) => [{ n: rows.length }])
    expect(usedGenres?.n).toBe(allGenres?.n)

    // Read back through the API's loaders: every stored Book satisfies the response schema.
    for (const book of await db.select().from(books)) {
      const detail = await loadBookDetail(db, book)
      expect(bookDetailSchema.safeParse(detail).success, book.slug).toBe(true)
    }

    const second = await seedCatalog(db)
    expect(second.created).toBe(0)
    expect(await totals()).toEqual(after)
  }, 120_000)
})
