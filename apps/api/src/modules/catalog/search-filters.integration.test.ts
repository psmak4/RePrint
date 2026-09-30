import { bookGenres, books, genres } from '@reprint/db'
import {
  type BookCandidate,
  type BookSearchPage,
  problemDetailsSchema,
  type SearchResponse,
  searchResponseSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import type { SourceAdapter } from '../../catalog/sources/types.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const stub = createStubSource()
/** What the Source answers; tests set it, and `sourceCalls` shows whether it was asked. */
let sourceCandidates: BookCandidate[] = []
let sourceCalls = 0

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
  })
  const source: SourceAdapter = {
    ...stub,
    searchBooks: async (): Promise<BookSearchPage> => {
      sourceCalls += 1
      return { candidates: sourceCandidates, page: 1, hasMore: false }
    },
  }
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
    catalog: { source, interactive: (fn) => fn() },
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  sourceCandidates = []
  sourceCalls = 0
  await stack.reset()
})

interface Fixture {
  id: string
  title: string
  author?: string
  year?: number | null
  language?: string
  isbn13?: string | null
  reviews?: { count: number; sum: number }
  genre?: string
}

function candidateOf({
  id,
  title,
  author = 'Some Author',
  year = 1970,
  language = 'en',
  isbn13 = null,
}: Fixture): BookCandidate {
  return {
    book: {
      title,
      subtitle: null,
      description: null,
      firstPublishedYear: year ?? null,
      originalLanguage: language,
      cover: null,
      contributions: [
        {
          authorName: author,
          role: 'author',
          position: 0,
          sourceLink: { source: 'stub', entityType: 'author', sourceId: `author-${author}` },
        },
      ],
      series: [],
      subjects: [],
    },
    editions: [
      {
        isbn13,
        format: 'paperback',
        language,
        title: null,
        publisherName: null,
        publishedDate: null,
        pageCount: null,
        cover: null,
        sourceLink: { source: 'stub', entityType: 'edition', sourceId: `edition-${id}` },
      },
    ],
    sourceLink: { source: 'stub', entityType: 'book', sourceId: `book-${id}` },
    confidence: 0.5,
  }
}

/** Stores a Book through the ingest path, then sets its review totals and Genre. */
async function store(fixture: Fixture): Promise<string> {
  const author = fixture.author ?? 'Some Author'
  const result = await ingestBook(stack.db.db, {
    source: stub,
    candidate: candidateOf(fixture),
    authorRecords: new Map([
      [
        `author-${author}`,
        {
          name: author,
          alternateNames: [],
          bio: null,
          birthDate: null,
          deathDate: null,
          photo: null,
          sourceLink: { source: 'stub', entityType: 'author', sourceId: `author-${author}` },
        },
      ],
    ]),
  })
  if (fixture.reviews) {
    await stack.db.db
      .update(books)
      .set({ reviewCount: fixture.reviews.count, ratingSum: fixture.reviews.sum })
      .where(eq(books.id, result.bookId))
  }
  if (fixture.genre) {
    const [genre] = await stack.db.db.select().from(genres).where(eq(genres.slug, fixture.genre))
    if (!genre) throw new Error(`unknown Genre ${fixture.genre}`)
    await stack.db.db
      .insert(bookGenres)
      .values({ bookId: result.bookId, genreId: genre.id, origin: 'admin' })
      .onConflictDoNothing()
  }
  return result.bookId
}

async function search(query: string): Promise<SearchResponse> {
  const response = await app.inject({ method: 'GET', url: `/v1/search?${query}` })
  expect(response.statusCode, response.body).toBe(200)
  return searchResponseSchema.parse(response.json())
}

const titles = (body: SearchResponse): string[] =>
  body.items.map((item) => {
    if (item.kind === 'book') return item.book.title
    if (item.kind === 'candidate') return `candidate:${item.candidate.title}`
    return `author:${item.author.name}`
  })

async function seedStarTrek() {
  await store({
    id: 'a',
    title: 'Star Old',
    year: 1962,
    reviews: { count: 2, sum: 10 },
    genre: 'science-fiction',
  })
  await store({
    id: 'b',
    title: 'Star Mid',
    year: 1995,
    language: 'fr',
    reviews: { count: 10, sum: 30 },
    genre: 'dystopian',
  })
  await store({
    id: 'c',
    title: 'Star New',
    year: 2021,
    reviews: { count: 5, sum: 20 },
    genre: 'fantasy',
  })
  await store({ id: 'd', title: 'Star Unrated', year: 1998 })
}

describe('GET /v1/search filters', () => {
  it('limits results to the Catalog, without asking the Source, for genre, language, or minRating', async () => {
    await seedStarTrek()
    sourceCandidates = [candidateOf({ id: 'src', title: 'Star Source' })]

    const genre = await search('q=star&genre=science-fiction')
    // Dystopian is a child of Science Fiction, so its Books match too.
    expect(titles(genre).sort()).toEqual(['Star Mid', 'Star Old'])
    const language = await search('q=star&language=fr')
    expect(titles(language)).toEqual(['Star Mid'])
    const rating = await search('q=star&minRating=4')
    expect(titles(rating).sort()).toEqual(['Star New', 'Star Old'])
    expect(sourceCalls).toBe(0)
    expect(genre.sourceUnavailable).toBe(false)
  })

  it('combines filters and returns nothing for an unknown Genre', async () => {
    await seedStarTrek()
    expect(titles(await search('q=star&genre=science-fiction&minRating=4'))).toEqual(['Star Old'])
    expect((await search('q=star&genre=no-such-genre')).items).toEqual([])
  })

  it('pages Catalog-only results by offset', async () => {
    for (let i = 0; i < 22; i += 1) {
      await store({ id: `p${i}`, title: `Paged ${String(i).padStart(2, '0')}`, genre: 'fantasy' })
    }
    const first = await search('q=paged&genre=fantasy&sort=newest')
    expect(first.items).toHaveLength(20)
    expect(first.hasMore).toBe(true)
    const second = await search('q=paged&genre=fantasy&sort=newest&page=2')
    expect(second.items).toHaveLength(2)
    expect(second.hasMore).toBe(false)
  })

  it('applies decade to Catalog Books, stored matches, and Source candidates alike', async () => {
    await seedStarTrek()
    sourceCandidates = [
      candidateOf({ id: 's1', title: 'Star Source 90s', year: 1991 }),
      candidateOf({ id: 's2', title: 'Star Source 2010s', year: 2012 }),
      candidateOf({ id: 's3', title: 'Star Source undated', year: null }),
    ]
    const nineties = await search('q=star&decade=1990')
    expect(titles(nineties).sort()).toEqual(
      ['Star Mid', 'Star Unrated', 'candidate:Star Source 90s'].sort(),
    )
    expect(sourceCalls).toBe(1)
  })

  it('rejects an out-of-range filter with Problem Details', async () => {
    for (const query of [
      'decade=1995',
      'minRating=6',
      'language=english',
      'sort=best',
      'type=series',
    ]) {
      const response = await app.inject({ method: 'GET', url: `/v1/search?q=star&${query}` })
      expect(response.statusCode, query).toBe(400)
      expect(problemDetailsSchema.safeParse(response.json()).success).toBe(true)
    }
  })
})

describe('GET /v1/search sorts', () => {
  it('sorts by most reviewed, highest rated, and newest, with Source candidates in the mix', async () => {
    await seedStarTrek()
    sourceCandidates = [candidateOf({ id: 'src', title: 'Star Source', year: 2030 })]
    expect(titles(await search('q=star&sort=most_reviewed')).slice(0, 3)).toEqual([
      'Star Mid',
      'Star New',
      'Star Old',
    ])
    expect(titles(await search('q=star&sort=highest_rated')).slice(0, 3)).toEqual([
      'Star Old',
      'Star New',
      'Star Mid',
    ])
    expect(titles(await search('q=star&sort=newest'))).toEqual([
      'candidate:Star Source',
      'Star New',
      'Star Unrated',
      'Star Mid',
      'Star Old',
    ])
  })

  it('defaults to relevance, where review count boosts a Book', async () => {
    await store({ id: 'x', title: 'Comet' })
    await store({ id: 'y', title: 'Comet', reviews: { count: 40, sum: 160 } })
    const body = await search('q=comet')
    const [first] = body.items
    expect(first?.kind === 'book' && first.book.rating.count).toBe(40)
  })
})

describe('GET /v1/search type=authors', () => {
  it('returns Authors from the Catalog only', async () => {
    await store({ id: 'h', title: 'Dune', author: 'Frank Herbert' })
    await store({ id: 'h2', title: 'Children of Dune', author: 'Frank Herbert' })
    await store({ id: 'o', title: 'Emma', author: 'Jane Austen' })
    const body = await search('q=herbert&type=authors')
    expect(titles(body)).toEqual(['author:Frank Herbert'])
    expect(body.hasMore).toBe(false)
    expect(body.isbnMatch).toBeNull()
    expect(sourceCalls).toBe(0)
  })
})

describe('GET /v1/search ISBN lookup', () => {
  it('returns the slug of a stored Book, from a hyphenated ISBN-13 or an ISBN-10, ranked first', async () => {
    const id = await store({ id: 'i', title: 'Dune', isbn13: '9780441172719' })
    await store({ id: 'j', title: 'Dune Messiah', isbn13: '9780593098233' })
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, id))
    for (const isbn of ['9780441172719', '978-0-441-17271-9', '0441172717']) {
      const body = await search(`q=${encodeURIComponent(isbn)}`)
      expect(body.isbnMatch, isbn).toEqual({ kind: 'book', slug: book?.slug })
      expect(body.items[0]?.kind === 'book' && body.items[0].book.id).toBe(id)
    }
  })

  it('returns a reference when only the Source has the Book, and it resolves', async () => {
    sourceCandidates = [
      candidateOf({ id: 'other', title: 'Another Book' }),
      candidateOf({ id: 'isbn', title: 'The Lookup', isbn13: '9780441172719' }),
    ]
    const body = await search('q=9780441172719')
    expect(body.isbnMatch?.kind).toBe('candidate')
    const first = body.items[0]
    expect(first?.kind === 'candidate' && first.candidate.title).toBe('The Lookup')
    expect(
      body.isbnMatch?.kind === 'candidate' && first?.kind === 'candidate' && body.isbnMatch.ref,
    ).toBe(first?.kind === 'candidate' ? first.candidate.ref : null)
  })

  it('returns no match for ordinary text and for an ISBN nobody has', async () => {
    await store({ id: 'k', title: 'Dune', isbn13: '9780441172719' })
    expect((await search('q=dune')).isbnMatch).toBeNull()
    expect((await search('q=9780306406157')).isbnMatch).toBeNull()
  })
})
