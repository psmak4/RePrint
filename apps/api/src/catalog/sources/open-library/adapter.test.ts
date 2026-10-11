import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runSourceContract } from '../../../testing/source-contract.js'
import { SourceError } from '../types.js'
import { createOpenLibraryAdapter, searchPath } from './adapter.js'
import { createFixtureFetch } from './fixture-fetch.js'
import { FIXTURES_DIR } from './record-fixtures.js'

const adapter = createOpenLibraryAdapter({ fetch: createFixtureFetch() })

runSourceContract(adapter, {
  searches: ['the left hand of darkness', 'ursula le guin', '978-0-441-47812-5'],
  emptySearch: 'zzz little known pamphlet 1890',
  bookIds: ['OL59800W'],
  authorIds: ['OL31353A'],
  unknownId: 'OL0W',
})

const fixture = (name: string) => readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8')
const replay =
  (body: string, status = 200): typeof fetch =>
  async () =>
    new Response(body, { status })

describe('searchPath', () => {
  it('searches an ISBN as ISBN-13, whether it is given as ISBN-10, hyphenated, or ISBN-13', () => {
    const path = '/search.json?q=isbn%3A9780441478125&limit=10'
    expect(searchPath('9780441478125', 1)).toBe(path)
    expect(searchPath('978-0-441-47812-5', 1)).toBe(path)
    expect(searchPath('0441478123', 1)).toBe(path)
  })

  it('adds the page from the second page on', () => {
    expect(searchPath('dune', 1)).toBe('/search.json?q=dune&limit=10')
    expect(searchPath('dune', 3)).toBe('/search.json?q=dune&limit=10&page=3')
  })
})

describe('Open Library searchBooks', () => {
  it('maps a title result to a Book candidate with an Edition, a Source link, and a confidence', async () => {
    const { candidates } = await adapter.searchBooks('the left hand of darkness', 1)
    const first = candidates[0]
    expect(first?.book).toMatchObject({
      title: 'The Left Hand of Darkness',
      firstPublishedYear: 1969,
      cover: { origin: 'open_library', originRef: '10618463' },
      contributions: [
        {
          authorName: 'Ursula K. Le Guin',
          role: 'author',
          position: 0,
          sourceLink: { source: 'open_library', entityType: 'author', sourceId: 'OL31353A' },
        },
      ],
    })
    expect(first?.sourceLink).toEqual({
      source: 'open_library',
      entityType: 'book',
      sourceId: 'OL59800W',
    })
    expect(first?.editions).toHaveLength(1)
    expect(first?.editions[0]).toMatchObject({
      format: 'unknown',
      sourceLink: { entityType: 'edition', sourceId: 'OL31935740M' },
    })
    expect(first?.confidence).toBe(1)
    const other = candidates.find((c) => c.sourceLink.sourceId === 'OL18955388W')
    expect(other?.confidence).toBeLessThan(1)
  })

  it('reads an ISBN search as an exact match', async () => {
    const { candidates } = await adapter.searchBooks('9780441478125', 1)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.confidence).toBe(1)
  })

  it('leaves the cover empty for a result with no cover', async () => {
    const page = await createOpenLibraryAdapter({
      fetch: replay(fixture('search-no-cover')),
    }).searchBooks('dune frank herbert', 1)
    const noCover = page.candidates.filter((c) => c.book.cover === null)
    expect(page.candidates.length).toBeGreaterThan(noCover.length)
    expect(noCover.length).toBeGreaterThan(0)
    for (const candidate of noCover) expect(candidate.editions[0]?.cover).toBeNull()
  })

  it('logs and skips a result that fails validation', async () => {
    const onInvalid = vi.fn()
    const page = await createOpenLibraryAdapter({
      fetch: replay(fixture('search-no-cover')),
      onInvalid,
    }).searchBooks('dune frank herbert', 1)
    // The recorded result "Dune by Frank Herbert [Chilton ...]" names no Author, so it cannot be a Book.
    expect(page.candidates.map((c) => c.book.title).join()).not.toContain('Chilton')
    expect(onInvalid).toHaveBeenCalledTimes(1)
  })

  it('caps a long contributor list and maps the rest to co-authors', async () => {
    const page = await createOpenLibraryAdapter({
      fetch: replay(fixture('search-no-cover')),
    }).searchBooks('metamorphoses', 1)
    const first = page.candidates[0]
    expect(first?.book.title).toBe('Metamorfosi')
    expect(first?.book.contributions).toHaveLength(10)
    expect(first?.book.contributions.map((c) => c.role).slice(0, 2)).toEqual([
      'author',
      'co_author',
    ])
  })

  it('takes the language only when a result has exactly one', async () => {
    const body = JSON.stringify({
      numFound: 2,
      docs: [
        { key: '/works/OL1W', title: 'Un', author_name: ['A'], language: ['fre'] },
        { key: '/works/OL2W', title: 'Deux', author_name: ['A'], language: ['fre', 'eng', 'und'] },
      ],
    })
    const page = await createOpenLibraryAdapter({ fetch: replay(body) }).searchBooks('a', 1)
    expect(page.candidates.map((c) => c.editions[0]?.language)).toEqual(['fr', null])
  })

  it('reports whether more results follow', async () => {
    const page1 = await adapter.searchBooks('the left hand of darkness', 1)
    expect(page1.hasMore).toBe(true)
    const body = JSON.stringify({
      numFound: 1,
      docs: [{ key: '/works/OL1W', title: 'Un', author_name: ['A'] }],
    })
    const last = await createOpenLibraryAdapter({ fetch: replay(body) }).searchBooks('x', 1)
    expect(last.hasMore).toBe(false)
  })

  it('returns an empty page without calling the Source for a blank query', async () => {
    const spy = vi.fn()
    const page = await createOpenLibraryAdapter({ fetch: spy }).searchBooks('   ', 1)
    expect(page).toEqual({ candidates: [], page: 1, hasMore: false })
    expect(spy).not.toHaveBeenCalled()
  })

  it('throws SourceError when the Source fails or answers with the wrong shape', async () => {
    const failing = createOpenLibraryAdapter({ fetch: replay('boom', 503) })
    await expect(failing.searchBooks('dune', 1)).rejects.toBeInstanceOf(SourceError)
    const unreachable = createOpenLibraryAdapter({
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    await expect(unreachable.searchBooks('dune', 1)).rejects.toBeInstanceOf(SourceError)
    const notJson = createOpenLibraryAdapter({ fetch: replay('<html>') })
    await expect(notJson.searchBooks('dune', 1)).rejects.toBeInstanceOf(SourceError)
    const wrongShape = createOpenLibraryAdapter({ fetch: replay('{"docs": 4}') })
    await expect(wrongShape.searchBooks('dune', 1)).rejects.toBeInstanceOf(SourceError)
  })
})

describe('Open Library getBook, getEditions, and getAuthor', () => {
  it('maps a work to a full Book with description, subjects, series, Editions, and Source link', async () => {
    const book = await adapter.getBook('OL59800W')
    expect(book).toMatchObject({
      book: {
        title: 'The Left Hand of Darkness',
        firstPublishedYear: 1969,
        cover: { origin: 'open_library', originRef: '10618463' },
        series: [{ name: 'Hainish Cycle', position: 4 }],
        contributions: [{ authorName: 'Ursula K. Le Guin', role: 'author' }],
      },
      sourceLink: { source: 'open_library', entityType: 'book', sourceId: 'OL59800W' },
      confidence: 1,
    })
    expect(book?.book.description).toContain('Kim Stanley Robinson')
    const labels = book?.book.subjects.map((s) => s.label)
    expect(labels).toContain('Science fiction')
    expect(labels?.some((label) => label.includes(':'))).toBe(false)
    expect(book?.editions.length).toBeGreaterThan(40)
    expect(book?.book.seriesReported).toBe(true)
  })

  it('adds the Edition behind the work Cover when the first page of Editions lacks it', async () => {
    const book = await adapter.getBook('OL59800W')
    const coverEdition = book?.editions.find((e) => e.sourceLink?.sourceId === 'OL31935740M')
    expect(coverEdition).toMatchObject({
      format: 'ebook',
      publisherName: 'ACE',
      cover: { origin: 'open_library', originRef: '10618463' },
    })
    expect(book?.book.cover?.originRef).toBe('10618463')
  })

  it('asks for the cover Edition only when the first page of Editions lacks it', async () => {
    const fixtures = createFixtureFetch()
    const paths: string[] = []
    const counting: typeof fetch = async (input, init) => {
      paths.push(new URL(String(input)).pathname)
      return fixtures(input, init)
    }
    await createOpenLibraryAdapter({ fetch: counting }).getBook('OL59800W')
    expect(paths.filter((path) => path.startsWith('/books/'))).toEqual(['/books/OL31935740M.json'])

    // When the Editions already include it, nothing more is fetched.
    const editions = JSON.parse(fixture('work-left-hand-editions'))
    editions.entries.push(JSON.parse(fixture('edition-left-hand-cover')))
    paths.length = 0
    const withCover: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      paths.push(url.pathname)
      return url.pathname.endsWith('/editions.json')
        ? Response.json(editions)
        : fixtures(input, init)
    }
    const book = await createOpenLibraryAdapter({ fetch: withCover }).getBook('OL59800W')
    expect(paths.filter((path) => path.startsWith('/books/'))).toEqual([])
    expect(book?.editions.filter((e) => e.sourceLink?.sourceId === 'OL31935740M')).toHaveLength(1)
  })

  it('still reads the Book when the cover Edition request fails', async () => {
    const fixtures = createFixtureFetch()
    const flaky = createOpenLibraryAdapter({
      fetch: async (input, init) =>
        new URL(String(input)).pathname.startsWith('/books/')
          ? new Response('busy', { status: 503 })
          : fixtures(input, init),
    })
    const book = await flaky.getBook('OL59800W')
    expect(book?.book.title).toBe('The Left Hand of Darkness')
    expect(book?.editions.some((e) => e.sourceLink?.sourceId === 'OL31935740M')).toBe(false)
  })

  it('says its Series list is not whole when the Editions could not be read', async () => {
    const fixtures = createFixtureFetch()
    const noEditions = createOpenLibraryAdapter({
      fetch: async (input, init) =>
        String(input).includes('/editions.json')
          ? new Response('not found', { status: 404 })
          : fixtures(input, init),
    })
    const book = await noEditions.getBook('OL59800W')
    expect(book?.book.series).toEqual([])
    expect(book?.book.seriesReported).toBe(false)
  })

  it('maps the Editions: ISBN-13 from ISBN-10, the five Formats, ISO 639 languages, and covers', async () => {
    const editions = await adapter.getEditions('OL59800W')
    const byId = (id: string) => editions.find((e) => e.sourceLink?.sourceId === id)
    // French paperback with ISBN-10 and ISBN-13, no language.
    expect(byId('OL12509193M')).toMatchObject({ isbn13: '9782266014632', format: 'paperback' })
    // No format, no ISBN, English.
    expect(byId('OL58916236M')).toMatchObject({ isbn13: null, format: 'unknown', language: 'en' })
    // Non-English.
    expect(byId('OL50179038M')).toMatchObject({ language: 'he' })
    expect(byId('OL35614636M')).toMatchObject({ language: 'tr', format: 'paperback' })
    // Ebook and audiobook.
    expect(byId('OL51009297M')?.format).toBe('ebook')
    expect(byId('OL8350044M')?.format).toBe('audiobook')
    expect(byId('OL8014319M')?.format).toBe('hardcover')
    // A cover by cover ID.
    expect(byId('OL33036131M')?.cover).toMatchObject({
      origin: 'open_library',
      originRef: '11727865',
    })
    // A publisher's ISBN-10 filed under isbn_13 is still converted.
    expect(byId('OL32003578M')?.isbn13).toBe('9788445070239')
  })

  it('maps an Author with a bio, dates, alternate names, and a photo', async () => {
    const author = await adapter.getAuthor('OL31353A')
    expect(author).toMatchObject({
      name: 'Ursula K. Le Guin',
      birthDate: '1929-10-21',
      deathDate: '2018-01-22',
      photo: { origin: 'open_library', originRef: '15165689' },
      sourceLink: { source: 'open_library', entityType: 'author', sourceId: 'OL31353A' },
    })
    expect(author?.bio).toContain('Ursula Kroeber Le Guin')
    expect(author?.alternateNames).toContain('Ursula LeGuin')
    expect(author?.alternateNames).not.toContain('Ursula K. Le Guin')
  })

  it('returns null or nothing for records the Source lacks, and for IDs that are not bare IDs', async () => {
    const spy = vi.fn()
    const guarded = createOpenLibraryAdapter({ fetch: spy })
    expect(await guarded.getBook('/works/OL1W')).toBeNull()
    expect(await guarded.getBook('OL1W/../../admin')).toBeNull()
    expect(await guarded.getEditions('x')).toEqual([])
    expect(await guarded.getAuthor('OL1W')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    expect(await adapter.getEditions('OL0W')).toEqual([])
  })

  it('logs and skips invalid records, never returning them', async () => {
    const onInvalid = vi.fn()
    const work = fixture('work-left-hand')
    const editions = JSON.parse(fixture('work-left-hand-editions'))
    editions.entries = [{ key: 'broken' }, editions.entries[0]]
    const routes: Record<string, string> = {
      '/works/OL59800W.json': work,
      '/works/OL59800W/editions.json': JSON.stringify(editions),
      '/search.json': fixture('work-left-hand-byline'),
    }
    const partial = createOpenLibraryAdapter({
      onInvalid,
      fetch: async (input) =>
        new Response(routes[new URL(String(input)).pathname] ?? '', { status: 200 }),
    })
    const book = await partial.getBook('OL59800W')
    expect(book?.editions).toHaveLength(1)
    expect(onInvalid).toHaveBeenCalledWith('Skipped an invalid Edition record', expect.anything())

    const badAuthor = createOpenLibraryAdapter({
      onInvalid,
      fetch: replay('{"key":"/authors/OL1A"}'),
    })
    expect(await badAuthor.getAuthor('OL1A')).toBeNull()
    const redirect = createOpenLibraryAdapter({
      onInvalid,
      fetch: replay('{"type":{"key":"/type/redirect"},"location":"/works/OL2W"}'),
    })
    expect(await redirect.getBook('OL1W')).toBeNull()
    expect(onInvalid).toHaveBeenCalledTimes(3)
  })

  it('throws SourceError when the Source fails while reading a record', async () => {
    const failing = createOpenLibraryAdapter({ fetch: replay('boom', 503) })
    await expect(failing.getBook('OL1W')).rejects.toBeInstanceOf(SourceError)
    await expect(failing.getEditions('OL1W')).rejects.toBeInstanceOf(SourceError)
    await expect(failing.getAuthor('OL1A')).rejects.toBeInstanceOf(SourceError)
  })
})
