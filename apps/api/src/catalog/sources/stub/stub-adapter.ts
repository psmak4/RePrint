import type {
  AuthorRecord,
  BookCandidate,
  BookCandidateEdition,
  BookSearchPage,
} from '@reprint/shared'
import type { SourceAdapter } from '../types.js'

const SOURCE = 'stub'
const PAGE_SIZE = 2

const cover = {
  origin: 'open_library',
  originRef: '1',
  width: null,
  height: null,
  url: null,
} as const

function authorLink(sourceId: string) {
  return { source: SOURCE, entityType: 'author', sourceId } as const
}

const AUTHORS: Record<string, AuthorRecord> = {
  'stub-author-herbert': {
    name: 'Frank Herbert',
    alternateNames: ['Frank Patrick Herbert'],
    bio: 'American science fiction author.',
    birthDate: '1920-10-08',
    deathDate: '1986-02-11',
    photo: null,
    sourceLink: authorLink('stub-author-herbert'),
  },
  'stub-author-tolkien': {
    name: 'J. R. R. Tolkien',
    alternateNames: [],
    // Markdown with a reference link, as Open Library writes bios (D-202).
    bio: 'English writer and philologist, best known for *The Hobbit*.\n\n([source][1])\n\n[1]: https://en.wikipedia.org/wiki/J._R._R._Tolkien',
    birthDate: '1892-01-03',
    deathDate: '1973-09-02',
    photo: null,
    sourceLink: authorLink('stub-author-tolkien'),
  },
}

const EDITIONS: Record<string, BookCandidateEdition[]> = {
  'stub-book-dune': [
    {
      isbn13: '9780441172719',
      format: 'paperback',
      language: 'en',
      title: null,
      publisherName: 'Ace',
      publishedDate: '1990-09-01',
      pageCount: 535,
      cover,
      sourceLink: { source: SOURCE, entityType: 'edition', sourceId: 'stub-edition-dune-1' },
    },
  ],
  'stub-book-hobbit': [
    {
      isbn13: '9780547928227',
      format: 'hardcover',
      language: 'en',
      title: null,
      publisherName: 'Mariner Books',
      publishedDate: '2012-09-18',
      pageCount: 300,
      cover: null,
      sourceLink: { source: SOURCE, entityType: 'edition', sourceId: 'stub-edition-hobbit-1' },
    },
  ],
  'stub-book-fellowship': [
    {
      isbn13: '9780261102354',
      format: 'paperback',
      language: 'en',
      title: null,
      publisherName: 'Allen & Unwin',
      publishedDate: '1954-07-29',
      pageCount: 423,
      cover: null,
      sourceLink: { source: SOURCE, entityType: 'edition', sourceId: 'stub-edition-fellowship-1' },
    },
  ],
}

/** The stub's one Series, so the Series sync can be tested end to end (D-199). */
const MIDDLE_EARTH = {
  source: SOURCE,
  entityType: 'series',
  sourceId: 'stub-series-middle-earth',
} as const

function bookCandidate(
  sourceId: string,
  title: string,
  authorSourceId: string,
  authorName: string,
  confidence: number,
  series: BookCandidate['book']['series'] = [],
): BookCandidate {
  return {
    book: {
      title,
      subtitle: null,
      description: null,
      firstPublishedYear: 1937,
      originalLanguage: 'en',
      cover: EDITIONS[sourceId]?.[0]?.cover ?? null,
      contributions: [
        { authorName, role: 'author', position: 0, sourceLink: authorLink(authorSourceId) },
      ],
      series,
      subjects: [{ label: 'Fiction' }],
    },
    editions: EDITIONS[sourceId] ?? [],
    sourceLink: { source: SOURCE, entityType: 'book', sourceId },
    confidence,
  }
}

const BOOKS: Record<string, BookCandidate> = {
  'stub-book-dune': bookCandidate(
    'stub-book-dune',
    'Dune',
    'stub-author-herbert',
    'Frank Herbert',
    1,
  ),
  'stub-book-hobbit': bookCandidate(
    'stub-book-hobbit',
    'The Hobbit',
    'stub-author-tolkien',
    'J. R. R. Tolkien',
    1,
    [{ name: 'Middle-earth', position: 1, sourceLink: MIDDLE_EARTH }],
  ),
  'stub-book-fellowship': bookCandidate(
    'stub-book-fellowship',
    'The Fellowship of the Ring',
    'stub-author-tolkien',
    'J. R. R. Tolkien',
    1,
    [{ name: 'Middle-earth', position: 2, sourceLink: MIDDLE_EARTH }],
  ),
}

function matches(candidate: BookCandidate, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return false
  const haystack = [
    candidate.book.title,
    ...candidate.book.contributions.map((c) => c.authorName),
    ...candidate.editions.map((e) => e.isbn13 ?? ''),
  ]
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

/**
 * An in-memory Source with three Books (two in one Series), for tests and for `SOURCE_MODE=stub`. It matches a query as a
 * case-insensitive substring of a title, an Author name, or an ISBN-13.
 */
export function createStubSource(): SourceAdapter {
  return {
    name: SOURCE,
    storagePolicy: 'store',
    trustedFields: { title: 1, contributions: 1, editions: 1, description: 2 },
    async searchBooks(query, page): Promise<BookSearchPage> {
      const found = Object.values(BOOKS).filter((candidate) => matches(candidate, query))
      const start = (page - 1) * PAGE_SIZE
      return {
        candidates: found.slice(start, start + PAGE_SIZE),
        page,
        hasMore: start + PAGE_SIZE < found.length,
      }
    },
    async getBook(sourceId) {
      return BOOKS[sourceId] ?? null
    },
    async getEditions(sourceId) {
      return EDITIONS[sourceId] ?? []
    },
    async getAuthor(sourceId) {
      return AUTHORS[sourceId] ?? null
    },
    async getSeriesMembers(sourceId) {
      if (sourceId !== MIDDLE_EARTH.sourceId) return null
      return {
        name: 'Middle-earth',
        members: [
          { sourceId: 'stub-book-hobbit', position: 1, title: 'The Hobbit' },
          { sourceId: 'stub-book-fellowship', position: 2, title: 'The Fellowship of the Ring' },
        ],
      }
    },
  }
}
