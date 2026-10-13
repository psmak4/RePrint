import { bookSeries, books, createDb, series, sourceLinks } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestBook } from './ingest/ingest.js'
import {
  importSeriesMember,
  queueSeriesMemberImports,
  queueSeriesSyncs,
  syncSeries,
} from './series-sync.js'
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

/** Stores the Hobbit, which brings in its Series (Middle-earth) with a Source link. */
async function storeHobbit() {
  const candidate = await stub.getBook('stub-book-hobbit')
  if (!candidate) throw new Error('no hobbit')
  const result = await ingestBook(db, { source: stub, candidate })
  const [row] = await db.select().from(series)
  if (!row) throw new Error('no series')
  return { result, seriesId: row.id }
}

async function seriesRow(id: string) {
  const [row] = await db.select().from(series).where(eq(series.id, id))
  return row
}

const titles = async () =>
  (await db.select({ title: books.title }).from(books)).map((book) => book.title).sort()

const fellowship = { sourceId: 'stub-book-fellowship', position: 2 }

describe('syncSeries', () => {
  it('records the count and time and lists the members to import, without fetching Books', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    const now = new Date('2026-10-10T00:00:00.000Z')
    const outcome = await syncSeries({ db, source: stub, seriesId, now })
    expect(outcome).toEqual({ outcome: 'synced', toImport: [{ seriesId, ...fellowship }] })
    expect(getBook).not.toHaveBeenCalled()
    expect(await seriesRow(seriesId)).toMatchObject({
      sourceMemberCount: 2,
      membersSyncedAt: now,
    })
    getBook.mockRestore()
  })

  it('fails without recording a sync when the list cannot be read, so the job retries', async () => {
    const { seriesId } = await storeHobbit()
    const failing = {
      ...stub,
      getSeriesMembers: async () => {
        throw new SourceError('Open Library is down')
      },
    }
    await expect(syncSeries({ db, source: failing, seriesId })).rejects.toBeInstanceOf(SourceError)
    expect(await seriesRow(seriesId)).toMatchObject({
      sourceMemberCount: null,
      membersSyncedAt: null,
    })
  })

  it('adds the membership of a member stored before it had the Series, without fetching it', async () => {
    const hobbit = await stub.getBook('stub-book-hobbit')
    const book = await stub.getBook('stub-book-fellowship')
    if (!hobbit || !book) throw new Error('missing stub data')
    // The Hobbit stored earlier with no Series (as before Series records existed).
    const old = await ingestBook(db, {
      source: stub,
      candidate: { ...hobbit, book: { ...hobbit.book, series: [] } },
    })
    await ingestBook(db, { source: stub, candidate: book })
    const [row] = await db.select().from(series)
    if (!row) throw new Error('no series')
    const outcome = await syncSeries({ db, source: stub, seriesId: row.id })
    expect(outcome).toEqual({ outcome: 'synced', toImport: [] })
    const members = await db
      .select({ bookId: bookSeries.bookId, position: bookSeries.position })
      .from(bookSeries)
      .where(eq(bookSeries.seriesId, row.id))
    expect(members).toContainEqual({ bookId: old.bookId, position: 1 })
  })

  it('leaves alone a stored member whose Series an admin locked', async () => {
    const hobbit = await stub.getBook('stub-book-hobbit')
    const book = await stub.getBook('stub-book-fellowship')
    if (!hobbit || !book) throw new Error('missing stub data')
    const old = await ingestBook(db, {
      source: stub,
      candidate: { ...hobbit, book: { ...hobbit.book, series: [] } },
    })
    await db
      .update(books)
      .set({ lockedFields: ['series'] })
      .where(eq(books.id, old.bookId))
    await ingestBook(db, { source: stub, candidate: book })
    const [row] = await db.select().from(series)
    if (!row) throw new Error('no series')
    await syncSeries({ db, source: stub, seriesId: row.id })
    const members = await db.select().from(bookSeries).where(eq(bookSeries.bookId, old.bookId))
    expect(members).toEqual([])
  })

  it('records a Series the Source no longer has as synced, so views stop queuing it', async () => {
    const { seriesId } = await storeHobbit()
    await db
      .update(sourceLinks)
      .set({ sourceId: 'stub-series-gone' })
      .where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_found' })
    expect((await seriesRow(seriesId))?.membersSyncedAt).not.toBeNull()
  })

  it('answers not_linked and unsupported', async () => {
    const { seriesId } = await storeHobbit()
    const { getSeriesMembers: _drop, ...without } = stub
    expect(await syncSeries({ db, source: without, seriesId })).toEqual({
      outcome: 'unsupported',
    })
    await db.delete(sourceLinks).where(eq(sourceLinks.entityType, 'series'))
    expect(await syncSeries({ db, source: stub, seriesId })).toEqual({ outcome: 'not_linked' })
  })
})

describe('importSeriesMember', () => {
  it('stores the member as a Series import in the Series', async () => {
    const { seriesId } = await storeHobbit()
    expect(await importSeriesMember({ db, source: stub, seriesId, ...fellowship })).toBe('imported')
    expect(await titles()).toEqual(['The Fellowship of the Ring', 'The Hobbit'])
    const [book] = await db
      .select()
      .from(books)
      .where(eq(books.title, 'The Fellowship of the Ring'))
    expect(book?.importOnly).toBe(true)
    const [member] = await db
      .select({ position: bookSeries.position })
      .from(bookSeries)
      .where(eq(bookSeries.bookId, book?.id ?? ''))
    expect(member?.position).toBe(2)
  })

  it('only adds the membership when the member is stored already', async () => {
    const { seriesId } = await storeHobbit()
    await importSeriesMember({ db, source: stub, seriesId, ...fellowship })
    const getBook = vi.spyOn(stub, 'getBook')
    expect(await importSeriesMember({ db, source: stub, seriesId, ...fellowship })).toBe('linked')
    expect(getBook).not.toHaveBeenCalled()
    getBook.mockRestore()
  })

  it('does not duplicate a member already stored under its ISBN', async () => {
    const { seriesId } = await storeHobbit()
    const book = await stub.getBook('stub-book-fellowship')
    if (!book) throw new Error('no fellowship')
    // The same Book reached earlier through another Source ID; only the ISBN matches.
    await ingestBook(db, {
      source: stub,
      candidate: { ...book, sourceLink: { ...book.sourceLink, sourceId: 'stub-other-id' } },
    })
    await importSeriesMember({ db, source: stub, seriesId, ...fellowship })
    expect((await titles()).filter((title) => title === 'The Fellowship of the Ring')).toHaveLength(
      1,
    )
  })

  it('throws when the Source fails, so the job retries', async () => {
    const { seriesId } = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook').mockRejectedValueOnce(new SourceError('busy'))
    await expect(
      importSeriesMember({ db, source: stub, seriesId, ...fellowship }),
    ).rejects.toBeInstanceOf(SourceError)
    getBook.mockRestore()
  })

  it('answers not_found when the Source no longer has the member', async () => {
    const { seriesId } = await storeHobbit()
    expect(
      await importSeriesMember({ db, source: stub, seriesId, sourceId: 'stub-gone', position: 3 }),
    ).toBe('not_found')
  })
})

describe('queueing', () => {
  it('queues one Series sync per Series, deduplicated while one is waiting or running', async () => {
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

  it('queues one import per member, deduplicated per Series and member', async () => {
    const enqueue = vi.fn(async () => 'id')
    await queueSeriesMemberImports({ enqueue }, [{ seriesId: 's1', sourceId: 'w1', position: 1 }])
    expect(enqueue.mock.calls).toEqual([
      [
        'catalog.series-member',
        { seriesId: 's1', sourceId: 'w1', position: 1 },
        { deduplicationId: 'catalog.series-member-s1-w1', priority: 10 },
      ],
    ])
  })
})
