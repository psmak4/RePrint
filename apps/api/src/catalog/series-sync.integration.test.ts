import { bookSeries, books, createDb, series, sourceLinks } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestBook } from './ingest/ingest.js'
import { queueSeriesSyncs, syncSeries } from './series-sync.js'
import { createStubSource } from './sources/stub/stub-adapter.js'

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

/** Stores the Hobbit, which brings in its Series (Middle-earth) with a Source link. */
async function storeHobbit() {
  const candidate = await stub.getBook('stub-book-hobbit')
  if (!candidate) throw new Error('no hobbit')
  const result = await ingestBook(db, { source: stub, candidate })
  const [row] = await db.select().from(series)
  if (!row) throw new Error('no series')
  return { result, seriesId: row.id }
}

const titles = async () =>
  (await db.select({ title: books.title }).from(books)).map((book) => book.title).sort()

describe('syncSeries', () => {
  it('imports the members not yet stored and records the count and time', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    const now = new Date('2026-10-10T00:00:00.000Z')
    const outcome = await syncSeries({ db, source: stub, seriesId, now })
    expect(outcome).toEqual({ outcome: 'synced', imported: 1, failed: 0 })
    expect(getBook.mock.calls.map(([id]) => id)).toEqual(['stub-book-fellowship'])
    expect(await titles()).toEqual(['The Fellowship of the Ring', 'The Hobbit'])
    const [row] = await db.select().from(series).where(eq(series.id, seriesId))
    expect(row).toMatchObject({ sourceMemberCount: 2, membersSyncedAt: now })
    getBook.mockRestore()
  })

  it('skips a member that fails and still records the sync', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook').mockRejectedValueOnce(new Error('boom'))
    const errors: string[] = []
    const outcome = await syncSeries({
      db,
      source: stub,
      seriesId,
      onMemberError: (sourceId) => errors.push(sourceId),
    })
    expect(outcome).toEqual({ outcome: 'synced', imported: 0, failed: 1 })
    expect(errors).toEqual(['stub-book-fellowship'])
    const [row] = await db.select().from(series).where(eq(series.id, seriesId))
    expect(row?.membersSyncedAt).not.toBeNull()
    getBook.mockRestore()
  })

  it('imports nothing the second time, so a repeat sync is cheap', async () => {
    const { seriesId } = await storeHobbit()
    await syncSeries({ db, source: stub, seriesId })
    const getBook = vi.spyOn(stub, 'getBook')
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({
      outcome: 'synced',
      imported: 0,
      failed: 0,
    })
    expect(getBook).not.toHaveBeenCalled()
    getBook.mockRestore()
  })

  it('does not duplicate a member already stored under its ISBN', async () => {
    const { seriesId } = await storeHobbit()
    const fellowship = await stub.getBook('stub-book-fellowship')
    if (!fellowship) throw new Error('no fellowship')
    // The same Book reached earlier through another Source ID; only the ISBN matches.
    await ingestBook(db, {
      source: stub,
      candidate: {
        ...fellowship,
        sourceLink: { ...fellowship.sourceLink, sourceId: 'stub-other-id' },
      },
    })
    await syncSeries({ db, source: stub, seriesId })
    expect((await titles()).filter((title) => title === 'The Fellowship of the Ring')).toHaveLength(
      1,
    )
  })

  it('adds the membership of a member stored before it had the Series, without fetching it', async () => {
    // The Hobbit stored earlier with no Series (as before Series records existed).
    const hobbit = await stub.getBook('stub-book-hobbit')
    const fellowship = await stub.getBook('stub-book-fellowship')
    if (!hobbit || !fellowship) throw new Error('missing stub data')
    const old = await ingestBook(db, {
      source: stub,
      candidate: { ...hobbit, book: { ...hobbit.book, series: [] } },
    })
    await ingestBook(db, { source: stub, candidate: fellowship })
    const [row] = await db.select().from(series)
    if (!row) throw new Error('no series')
    const getBook = vi.spyOn(stub, 'getBook')
    await syncSeries({ db, source: stub, seriesId: row.id })
    expect(getBook).not.toHaveBeenCalled()
    const members = await db
      .select({ bookId: bookSeries.bookId, position: bookSeries.position })
      .from(bookSeries)
      .where(eq(bookSeries.seriesId, row.id))
    expect(members).toContainEqual({ bookId: old.bookId, position: 1 })
    getBook.mockRestore()
  })

  it('leaves alone a stored member whose Series an admin locked', async () => {
    const hobbit = await stub.getBook('stub-book-hobbit')
    const fellowship = await stub.getBook('stub-book-fellowship')
    if (!hobbit || !fellowship) throw new Error('missing stub data')
    const old = await ingestBook(db, {
      source: stub,
      candidate: { ...hobbit, book: { ...hobbit.book, series: [] } },
    })
    await db
      .update(books)
      .set({ lockedFields: ['series'] })
      .where(eq(books.id, old.bookId))
    await ingestBook(db, { source: stub, candidate: fellowship })
    const [row] = await db.select().from(series)
    if (!row) throw new Error('no series')
    await syncSeries({ db, source: stub, seriesId: row.id })
    const members = await db.select().from(bookSeries).where(eq(bookSeries.bookId, old.bookId))
    expect(members).toEqual([])
  })

  it('answers not_found, not_linked, and unsupported', async () => {
    const { seriesId } = await storeHobbit()
    await db
      .update(sourceLinks)
      .set({ sourceId: 'stub-series-gone' })
      .where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_found' })
    await db.delete(sourceLinks).where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_linked' })
    const { getSeriesMembers: _drop, ...without } = stub
    expect(await syncSeries({ db, source: without, seriesId })).toEqual({
      outcome: 'unsupported',
    })
  })
})

describe('queueSeriesSyncs', () => {
  it('queues one background job per Series, deduplicated while one is waiting or running', async () => {
    const enqueue = vi.fn(async () => 'id')
    await queueSeriesSyncs({ enqueue }, ['s1', 's2'])
    expect(enqueue.mock.calls).toEqual([
      [
        'catalog.series-sync',
        { seriesId: 's1' },
        { deduplicationId: 'catalog.series-sync-s1', priority: 10 },
      ],
      [
        'catalog.series-sync',
        { seriesId: 's2' },
        { deduplicationId: 'catalog.series-sync-s2', priority: 10 },
      ],
    ])
  })
})
