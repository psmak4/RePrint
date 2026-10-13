import { authors, books, createDb, sourceLinks } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authorDueForSync,
  importAuthorBook,
  queueAuthorBookImports,
  queueAuthorSync,
  syncAuthorBooks,
} from './author-sync.js'
import { ingestBook } from './ingest/ingest.js'
import { createStubSource } from './sources/stub/stub-adapter.js'
import { SourceError } from './sources/types.js'
import { STALE_AFTER_MS } from './staleness.js'

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

/** Stores the Hobbit as a reached Book, which stores Tolkien with a Source link. */
async function storeHobbit(options: { importOnly?: boolean } = {}) {
  const candidate = await stub.getBook('stub-book-hobbit')
  const tolkien = await stub.getAuthor('stub-author-tolkien')
  if (!candidate || !tolkien) throw new Error('missing stub data')
  await ingestBook(db, {
    source: stub,
    candidate,
    authorRecords: new Map([['stub-author-tolkien', tolkien]]),
    ...(options.importOnly ? { importOnly: true } : {}),
  })
  const [author] = await db.select().from(authors)
  if (!author) throw new Error('no author')
  return author
}

const titles = async () =>
  (await db.select({ title: books.title }).from(books)).map((book) => book.title).sort()

describe('syncAuthorBooks', () => {
  it('records the count and time and lists the Books to import, without fetching them', async () => {
    const tolkien = await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    const now = new Date('2026-10-13T00:00:00.000Z')
    const result = await syncAuthorBooks({ db, source: stub, authorId: tolkien.id, now })
    expect(result).toEqual({
      outcome: 'synced',
      toImport: [
        { authorId: tolkien.id, sourceId: 'stub-book-fellowship' },
        { authorId: tolkien.id, sourceId: 'stub-book-silmarillion' },
      ],
    })
    expect(getBook).not.toHaveBeenCalled()
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row).toMatchObject({ sourceBookCount: 3, bibliographySyncedAt: now })
    getBook.mockRestore()
  })

  it('fails without recording a sync when the list cannot be read, so the job retries', async () => {
    const tolkien = await storeHobbit()
    const failing = {
      ...stub,
      getAuthorBooks: async () => {
        throw new SourceError('Open Library is down')
      },
    }
    await expect(
      syncAuthorBooks({ db, source: failing, authorId: tolkien.id }),
    ).rejects.toBeInstanceOf(SourceError)
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row).toMatchObject({ sourceBookCount: null, bibliographySyncedAt: null })
  })

  it('records an Author with no link to this Source, or a Source without the method, as synced', async () => {
    const tolkien = await storeHobbit()
    const now = new Date('2026-10-13T00:00:00.000Z')
    const { getAuthorBooks: _, ...withoutMethod } = stub
    expect(await syncAuthorBooks({ db, source: withoutMethod, authorId: tolkien.id, now })).toEqual(
      { outcome: 'unsupported' },
    )
    await db.update(authors).set({ bibliographySyncedAt: null })
    await db
      .delete(sourceLinks)
      .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, tolkien.id)))
    expect(await syncAuthorBooks({ db, source: stub, authorId: tolkien.id, now })).toEqual({
      outcome: 'not_linked',
    })
    const [row] = await db.select().from(authors).where(eq(authors.id, tolkien.id))
    expect(row?.bibliographySyncedAt).toEqual(now)
  })
})

describe('importAuthorBook', () => {
  it('stores the Book as an import-only Book credited to the Author', async () => {
    await storeHobbit()
    expect(await importAuthorBook({ db, source: stub, sourceId: 'stub-book-silmarillion' })).toBe(
      'imported',
    )
    const [silmarillion] = await db.select().from(books).where(eq(books.title, 'The Silmarillion'))
    expect(silmarillion?.importOnly).toBe(true)
    expect(await titles()).toEqual(['The Hobbit', 'The Silmarillion'])
  })

  it('neither fetches nor duplicates a Book stored already', async () => {
    await storeHobbit()
    const getBook = vi.spyOn(stub, 'getBook')
    expect(await importAuthorBook({ db, source: stub, sourceId: 'stub-book-hobbit' })).toBe(
      'stored',
    )
    expect(getBook).not.toHaveBeenCalled()
    expect(await titles()).toEqual(['The Hobbit'])
    getBook.mockRestore()
  })

  it('answers not_found when the Source no longer has the Book, and throws when it fails', async () => {
    await storeHobbit()
    expect(await importAuthorBook({ db, source: stub, sourceId: 'stub-book-gone' })).toBe(
      'not_found',
    )
    const failing = {
      ...stub,
      getBook: async () => {
        throw new SourceError('Open Library is down')
      },
    }
    await expect(
      importAuthorBook({ db, source: failing, sourceId: 'stub-book-silmarillion' }),
    ).rejects.toBeInstanceOf(SourceError)
  })
})

describe('authorDueForSync', () => {
  const now = new Date('2026-10-13T00:00:00.000Z')

  it('is due for an Author with a reached Book who was never synced or not in 30 days', async () => {
    const tolkien = await storeHobbit()
    expect(await authorDueForSync(db, { id: tolkien.id, bibliographySyncedAt: null }, now)).toBe(
      true,
    )
    const old = new Date(now.getTime() - STALE_AFTER_MS - 1)
    expect(await authorDueForSync(db, { id: tolkien.id, bibliographySyncedAt: old }, now)).toBe(
      true,
    )
    const recent = new Date(now.getTime() - 1000)
    expect(await authorDueForSync(db, { id: tolkien.id, bibliographySyncedAt: recent }, now)).toBe(
      false,
    )
  })

  it('is not due when every Book they are credited on is import-only (one level)', async () => {
    const tolkien = await storeHobbit({ importOnly: true })
    expect(await authorDueForSync(db, { id: tolkien.id, bibliographySyncedAt: null }, now)).toBe(
      false,
    )
  })

  it('is not due without a Source link', async () => {
    const tolkien = await storeHobbit()
    await db
      .delete(sourceLinks)
      .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, tolkien.id)))
    expect(await authorDueForSync(db, { id: tolkien.id, bibliographySyncedAt: null }, now)).toBe(
      false,
    )
  })
})

describe('queueing', () => {
  it('queues one sync per Author and one import per Book, deduplicated, in the background', async () => {
    const enqueue = vi.fn(async () => '1')
    await queueAuthorSync({ enqueue }, 'a1')
    await queueAuthorBookImports({ enqueue }, [{ authorId: 'a1', sourceId: 'b1' }])
    expect(enqueue).toHaveBeenNthCalledWith(
      1,
      'catalog.author-sync',
      { authorId: 'a1' },
      { deduplicationId: 'catalog.author-sync-a1', priority: 10 },
    )
    expect(enqueue).toHaveBeenNthCalledWith(
      2,
      'catalog.author-book',
      { authorId: 'a1', sourceId: 'b1' },
      { deduplicationId: 'catalog.author-book-a1-b1', priority: 10 },
    )
  })
})
