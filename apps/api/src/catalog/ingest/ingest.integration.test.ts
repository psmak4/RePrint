import {
  authors,
  bookGenres,
  bookSeries,
  bookSubjects,
  books,
  contributions,
  createDb,
  editions,
  genres,
  mergeCandidates,
  series,
  sourceLinks,
  sourceRecords,
} from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import type { BookCandidate } from '@reprint/shared'
import { and, count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createStubSource } from '../sources/stub/stub-adapter.js'
import type { SourceAdapter } from '../sources/types.js'
import { IngestError, ingestBook } from './ingest.js'

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

async function stubCandidate(sourceId: string): Promise<BookCandidate> {
  const candidate = await stub.getBook(sourceId)
  if (!candidate) throw new Error(`stub has no ${sourceId}`)
  return candidate
}

async function rowCounts() {
  const tables = { books, editions, authors, contributions, sourceLinks, series, bookSubjects }
  const result: Record<string, number> = {}
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await db.select({ n: count() }).from(table)
    result[name] = row?.n ?? 0
  }
  return result
}

describe('ingestBook', () => {
  it('stores a Book with its Editions, Authors, Subjects, and Source links', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const authorRecord = await stub.getAuthor('stub-author-herbert')
    if (!authorRecord) throw new Error('missing author')
    const result = await ingestBook(db, {
      source: stub,
      candidate,
      authorRecords: new Map([['stub-author-herbert', authorRecord]]),
    })
    expect(result.created).toBe(true)
    expect(result.slug).toMatch(/^dune-[0-9a-f]{6}$/)

    const [book] = await db.select().from(books).where(eq(books.id, result.bookId))
    expect(book?.title).toBe('Dune')
    expect(book?.refreshedAt).not.toBeNull()
    expect(book?.searchVector).toContain('frank')
    expect(Object.keys(book?.fieldOrigins ?? {})).toContain('title')
    const [author] = await db.select().from(authors)
    expect(author?.name).toBe('Frank Herbert')
    expect(author?.bio).toBe('American science fiction author.')
    expect(author?.birthDate).toBe('1920-10-08')
    const links = await db.select().from(sourceLinks)
    expect(links.map((link) => link.entityType).sort()).toEqual(['author', 'book', 'edition'])
    expect(await db.select().from(editions)).toHaveLength(1)
    expect(await db.select().from(sourceRecords)).toHaveLength(1)
  })

  it('creates no duplicates when the same record is ingested again', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const first = await ingestBook(db, { source: stub, candidate })
    const before = await rowCounts()
    const second = await ingestBook(db, { source: stub, candidate })
    expect(second.created).toBe(false)
    expect(second.bookId).toBe(first.bookId)
    expect(second.slug).toBe(first.slug)
    expect(await rowCounts()).toEqual(before)
  })

  it('matches by ISBN-13 when the Source link is new', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const first = await ingestBook(db, { source: stub, candidate })
    const relinked: BookCandidate = {
      ...candidate,
      sourceLink: { ...candidate.sourceLink, sourceId: 'stub-book-dune-other-id' },
      editions: candidate.editions.map(({ sourceLink: _link, ...rest }) => rest),
    }
    const second = await ingestBook(db, { source: stub, candidate: relinked })
    expect(second.created).toBe(false)
    expect(second.bookId).toBe(first.bookId)
    expect(await db.select().from(editions)).toHaveLength(1)
    const bookLinks = await db.select().from(sourceLinks).where(eq(sourceLinks.entityType, 'book'))
    expect(bookLinks).toHaveLength(2)
  })

  it('queues a merge candidate, and does not merge, on a title-and-author-only match', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const first = await ingestBook(db, { source: stub, candidate })
    const lookalike: BookCandidate = {
      ...candidate,
      sourceLink: { ...candidate.sourceLink, sourceId: 'stub-book-dune-2' },
      book: {
        ...candidate.book,
        contributions: candidate.book.contributions.map(({ sourceLink: _link, ...rest }) => rest),
      },
      editions: candidate.editions.map(({ sourceLink: _link, ...rest }) => ({
        ...rest,
        isbn13: null,
      })),
    }
    const second = await ingestBook(db, { source: stub, candidate: lookalike })
    expect(second.created).toBe(true)
    expect(second.bookId).not.toBe(first.bookId)
    expect(second.mergeCandidateBookIds).toEqual([first.bookId])
    const [pending] = await db.select().from(mergeCandidates)
    expect(pending).toMatchObject({
      bookAId: first.bookId,
      bookBId: second.bookId,
      status: 'pending',
    })
    expect(await db.select().from(books)).toHaveLength(2)
  })

  it('records Series with a decimal position and keeps it when a later Source omits it', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const withSeries: BookCandidate = {
      ...candidate,
      book: { ...candidate.book, series: [{ name: 'Dune Chronicles', position: 2.5 }] },
    }
    const first = await ingestBook(db, { source: stub, candidate: withSeries })
    await ingestBook(db, {
      source: stub,
      candidate: {
        ...withSeries,
        book: { ...withSeries.book, series: [{ name: 'dune chronicles', position: null }] },
      },
    })
    expect(await db.select().from(series)).toHaveLength(1)
    const [membership] = await db
      .select()
      .from(bookSeries)
      .where(eq(bookSeries.bookId, first.bookId))
    expect(membership?.position).toBe(2.5)
  })

  it('drops a Series the Source no longer reports, and the Series once it has no Books', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const inSeries = (...names: string[]): BookCandidate => ({
      ...candidate,
      book: {
        ...candidate.book,
        series: names.map((name) => ({ name, position: 1 })),
        seriesReported: true,
      },
    })
    const first = await ingestBook(db, { source: stub, candidate: inSeries('Compactos', 'Dune') })
    await ingestBook(db, { source: stub, candidate: inSeries('Dune') })

    const names = await db
      .select({ name: series.name })
      .from(bookSeries)
      .innerJoin(series, eq(series.id, bookSeries.seriesId))
      .where(eq(bookSeries.bookId, first.bookId))
    expect(names).toEqual([{ name: 'Dune' }])
    expect((await db.select({ name: series.name }).from(series)).map((row) => row.name)).toEqual([
      'Dune',
    ])
  })

  it('keeps Series when the Source list is not whole, and keeps a Series an admin edited', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const first = await ingestBook(db, {
      source: stub,
      candidate: {
        ...candidate,
        book: { ...candidate.book, series: [{ name: 'Dune', position: 1 }] },
      },
    })
    // A Source that could not read where its Series come from says nothing about them.
    await ingestBook(db, {
      source: stub,
      candidate: { ...candidate, book: { ...candidate.book, series: [], seriesReported: false } },
    })
    expect(
      await db.select().from(bookSeries).where(eq(bookSeries.bookId, first.bookId)),
    ).toHaveLength(1)

    await db.update(series).set({
      description: 'Edited',
      fieldOrigins: { description: { source: 'admin', at: '2026-01-01T00:00:00.000Z' } },
    })
    await ingestBook(db, {
      source: stub,
      candidate: { ...candidate, book: { ...candidate.book, series: [], seriesReported: true } },
    })
    expect(
      await db.select().from(bookSeries).where(eq(bookSeries.bookId, first.bookId)),
    ).toHaveLength(0)
    expect(await db.select().from(series)).toHaveLength(1)
  })

  it('records field origins and never overwrites locked fields on re-ingest', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    const first = await ingestBook(db, { source: stub, candidate })
    await db
      .update(books)
      .set({
        title: 'Dune (admin title)',
        lockedFields: ['title'],
        fieldOrigins: { title: { source: 'admin', at: '2026-01-01T00:00:00.000Z' } },
      })
      .where(eq(books.id, first.bookId))
    await ingestBook(db, {
      source: stub,
      candidate: {
        ...candidate,
        book: { ...candidate.book, title: 'Dune Again', description: 'A new description.' },
      },
    })
    const [book] = await db.select().from(books).where(eq(books.id, first.bookId))
    expect(book?.title).toBe('Dune (admin title)')
    expect(book?.description).toBe('A new description.')
    expect(book?.fieldOrigins).toMatchObject({
      title: { source: 'admin' },
      description: { source: 'stub' },
    })
  })

  it('keeps the raw record in source_records', async () => {
    const candidate = await stubCandidate('stub-book-hobbit')
    await ingestBook(db, { source: stub, candidate, rawRecord: { raw: true } })
    const [record] = await db.select().from(sourceRecords)
    expect(record).toMatchObject({
      source: 'stub',
      sourceId: 'stub-book-hobbit',
      payload: { raw: true },
    })
  })

  it('rejects a Source whose storage policy is not Store', async () => {
    const cacheOnly: SourceAdapter = { ...stub, storagePolicy: 'cache' }
    const candidate = await stubCandidate('stub-book-dune')
    await expect(ingestBook(db, { source: cacheOnly, candidate })).rejects.toBeInstanceOf(
      IngestError,
    )
    await expect(
      ingestBook(db, { source: { ...stub, storagePolicy: 'none' }, candidate }),
    ).rejects.toThrow(/does not allow/)
    expect(await rowCounts()).toMatchObject({ books: 0, editions: 0, authors: 0 })
  })

  it('rejects a candidate that belongs to a different Source', async () => {
    const candidate = await stubCandidate('stub-book-dune')
    await expect(
      ingestBook(db, { source: { ...stub, name: 'other' }, candidate }),
    ).rejects.toBeInstanceOf(IngestError)
  })

  it('creates one Book when the same record is ingested concurrently', async () => {
    const candidate = await stubCandidate('stub-book-hobbit')
    const results = await Promise.all([
      ingestBook(db, { source: stub, candidate }),
      ingestBook(db, { source: stub, candidate }),
      ingestBook(db, { source: stub, candidate }),
    ])
    expect(new Set(results.map((r) => r.bookId)).size).toBe(1)
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(await db.select().from(books)).toHaveLength(1)
  })

  describe('enrichment', () => {
    const hobbit = () => stubCandidate('stub-book-hobbit')

    async function genreSlugs(bookId: string) {
      const rows = await db
        .select({ slug: genres.slug, origin: bookGenres.origin })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(eq(bookGenres.bookId, bookId))
      return rows.map((row) => `${row.slug}:${row.origin}`).sort()
    }

    it('sets the Primary Edition to the best ranked Edition', async () => {
      const candidate = await hobbit()
      const [base] = candidate.editions
      if (!base) throw new Error('missing edition')
      const result = await ingestBook(db, {
        source: stub,
        candidate: {
          ...candidate,
          editions: [
            {
              ...base,
              isbn13: '9780261102217',
              language: 'fr',
              sourceLink: { source: 'stub', entityType: 'edition', sourceId: 'hobbit-fr' },
            },
            {
              ...base,
              sourceLink: { source: 'stub', entityType: 'edition', sourceId: 'hobbit-en' },
            },
          ],
        },
      })
      const [book] = await db.select().from(books).where(eq(books.id, result.bookId))
      const [english] = await db
        .select()
        .from(editions)
        .where(and(eq(editions.bookId, result.bookId), eq(editions.language, 'en')))
      expect(book?.primaryEditionId).toBe(english?.id)
    })

    it('keeps an admin-locked Primary Edition', async () => {
      const candidate = await hobbit()
      const first = await ingestBook(db, { source: stub, candidate })
      const [other] = await db
        .insert(editions)
        .values({ bookId: first.bookId, format: 'ebook', language: 'de' })
        .returning()
      await db
        .update(books)
        .set({ primaryEditionId: other?.id, lockedFields: ['primaryEdition'] })
        .where(eq(books.id, first.bookId))
      await ingestBook(db, { source: stub, candidate })
      const [book] = await db.select().from(books).where(eq(books.id, first.bookId))
      expect(book?.primaryEditionId).toBe(other?.id)
    })

    it('maps Subjects to Genres and leaves admin Genres untouched', async () => {
      const candidate = await hobbit()
      const withSubjects: BookCandidate = {
        ...candidate,
        book: {
          ...candidate.book,
          subjects: [{ label: 'Fantasy fiction' }, { label: 'Cookery' }],
        },
      }
      const first = await ingestBook(db, { source: stub, candidate: withSubjects })
      expect(await genreSlugs(first.bookId)).toEqual(['fantasy:mapping'])

      const [science] = await db.select().from(genres).where(eq(genres.slug, 'science-fiction'))
      const [fantasy] = await db.select().from(genres).where(eq(genres.slug, 'fantasy'))
      if (!science || !fantasy) throw new Error('missing Genres')
      await db.insert(bookGenres).values({
        bookId: first.bookId,
        genreId: science.id,
        origin: 'admin',
      })
      await db
        .update(bookGenres)
        .set({ origin: 'admin' })
        .where(and(eq(bookGenres.bookId, first.bookId), eq(bookGenres.genreId, fantasy.id)))
      await ingestBook(db, { source: stub, candidate: withSubjects })
      expect(await genreSlugs(first.bookId)).toEqual(['fantasy:admin', 'science-fiction:admin'])
    })

    it('does not touch Genres when an admin locked them', async () => {
      const candidate = await hobbit()
      const first = await ingestBook(db, { source: stub, candidate })
      await db
        .update(books)
        .set({ lockedFields: ['genres'] })
        .where(eq(books.id, first.bookId))
      await ingestBook(db, {
        source: stub,
        candidate: {
          ...candidate,
          book: { ...candidate.book, subjects: [{ label: 'Fantasy fiction' }] },
        },
      })
      expect(await genreSlugs(first.bookId)).toEqual([])
    })

    it('lets the higher-priority of two Sources win a field, and admin always wins', async () => {
      const candidate = await hobbit()
      const strong: SourceAdapter = { ...stub, name: 'strong', trustedFields: { description: 1 } }
      const weak: SourceAdapter = { ...stub, name: 'weak', trustedFields: { description: 2 } }
      const from = (name: string, description: string): BookCandidate => ({
        ...candidate,
        sourceLink: { ...candidate.sourceLink, source: name, sourceId: `${name}-hobbit` },
        book: { ...candidate.book, description },
        editions: candidate.editions.map(({ sourceLink: _link, ...rest }) => rest),
      })
      const first = await ingestBook(db, {
        source: strong,
        otherSources: [weak],
        candidate: from('strong', 'Strong text'),
      })
      await ingestBook(db, {
        source: weak,
        otherSources: [strong],
        candidate: from('weak', 'Weak text'),
      })
      const [kept] = await db.select().from(books).where(eq(books.id, first.bookId))
      expect(kept?.description).toBe('Strong text')
      expect(kept?.fieldOrigins).toMatchObject({ description: { source: 'strong' } })

      await db
        .update(books)
        .set({
          description: 'Admin text',
          fieldOrigins: { description: { source: 'admin', at: '2026-01-01T00:00:00.000Z' } },
        })
        .where(eq(books.id, first.bookId))
      await ingestBook(db, {
        source: strong,
        otherSources: [weak],
        candidate: from('strong', 'Stronger text'),
      })
      const [locked] = await db.select().from(books).where(eq(books.id, first.bookId))
      expect(locked?.description).toBe('Admin text')
    })
  })
})
