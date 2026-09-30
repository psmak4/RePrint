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
  bookIds: [],
  authorIds: [],
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
