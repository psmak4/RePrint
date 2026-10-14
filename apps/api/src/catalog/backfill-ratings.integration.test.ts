import { books, createDb, sourceLinks, sourceRatings } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { backfillSourceRatings } from './backfill-ratings.js'
import { ingestBook } from './ingest/ingest.js'
import { createStubSource } from './sources/stub/stub-adapter.js'
import { SourceError } from './sources/types.js'

let database: TestDatabase
let db: ReturnType<typeof createDb>['db']
let closeDb: () => Promise<void>
const stub = createStubSource()

beforeAll(async () => {
  database = await startTestDatabase()
  const client = createDb(database.url)
  db = client.db
  closeDb = client.close
})
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})
beforeEach(() => truncateAllTables(database.sql))

/** Stores Dune and the Hobbit, then forgets their ratings, as Books stored before D-204 would be. */
async function storeWithoutRatings() {
  for (const id of ['stub-book-dune', 'stub-book-hobbit']) {
    const candidate = await stub.getBook(id)
    if (!candidate) throw new Error(`no ${id}`)
    await ingestBook(db, { source: stub, candidate })
  }
  await db.delete(sourceRatings)
}

const ratingsByTitle = async () =>
  (
    await db
      .select({ title: books.title, count: sourceRatings.count })
      .from(sourceRatings)
      .innerJoin(sourceLinks, eq(sourceLinks.id, sourceRatings.sourceLinkId))
      .innerJoin(books, eq(books.id, sourceLinks.entityId))
  ).map((row) => [row.title, row.count])

describe('backfillSourceRatings (D-204)', () => {
  it('fills in the ratings the Source has and removes those it no longer has', async () => {
    await storeWithoutRatings()
    const [dune] = await db
      .select({ id: sourceLinks.id })
      .from(sourceLinks)
      .where(eq(sourceLinks.sourceId, 'stub-book-dune'))
    if (!dune) throw new Error('no dune')
    await db.insert(sourceRatings).values({
      sourceLinkId: dune.id,
      average: 3,
      count: 2,
      counts: [0, 0, 2, 0, 0],
      fetchedAt: new Date(),
    })
    expect(await backfillSourceRatings({ db, source: stub })).toEqual({
      saved: 1,
      removed: 1,
      failedBatches: 0,
    })
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })

  it('leaves Books the Source did not return as they are, and is safe to run again', async () => {
    await storeWithoutRatings()
    const partial = { ...stub, getBookRatings: async () => new Map() }
    expect(await backfillSourceRatings({ db, source: partial })).toEqual({
      saved: 0,
      removed: 0,
      failedBatches: 0,
    })
    await backfillSourceRatings({ db, source: stub })
    expect(await backfillSourceRatings({ db, source: stub })).toMatchObject({ failedBatches: 0 })
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })

  it('skips a batch the Source fails on, carries on, and reports it', async () => {
    await storeWithoutRatings()
    const logged: string[] = []
    const flaky = {
      ...stub,
      getBookRatings: async (ids: string[]) => {
        if (ids.includes('stub-book-dune')) throw new SourceError('Open Library is down')
        return (await stub.getBookRatings?.(ids)) ?? new Map()
      },
    }
    const result = await backfillSourceRatings({
      db,
      source: flaky,
      batchSize: 1,
      log: (message) => logged.push(message),
    })
    expect(result).toEqual({ saved: 1, removed: 0, failedBatches: 1 })
    expect(logged).toHaveLength(1)
    expect(await ratingsByTitle()).toEqual([['The Hobbit', 500]])
  })
})
