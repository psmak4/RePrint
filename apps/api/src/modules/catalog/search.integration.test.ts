import { books } from '@reprint/db'
import { type BookCandidate, searchSuggestResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { searchCatalogAuthors, searchCatalogBooks } from '../../catalog/search/catalog-search.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import type { SourceAdapter } from '../../catalog/sources/types.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const stub = createStubSource()
/** Every call that reaches the Source; suggestions must leave this at zero (PRD §6). */
let sourceCalls = 0
const countingSource: SourceAdapter = {
  ...stub,
  searchBooks: (...args) => {
    sourceCalls += 1
    return stub.searchBooks(...args)
  },
  getBook: (...args) => {
    sourceCalls += 1
    return stub.getBook(...args)
  },
  getEditions: (...args) => {
    sourceCalls += 1
    return stub.getEditions(...args)
  },
  getAuthor: (...args) => {
    sourceCalls += 1
    return stub.getAuthor(...args)
  },
}

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
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
    catalog: { source: countingSource, interactive: (fn) => fn() },
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  sourceCalls = 0
  await stack.reset()
})

interface Fixture {
  id: string
  title: string
  author: string
  isbn13?: string
  series?: string
}

let counter = 0

/** Stores a Book through the ingest path with one author and, optionally, an ISBN and Series. */
async function store({ id, title, author, isbn13, series }: Fixture) {
  counter += 1
  const candidate: BookCandidate = {
    book: {
      title,
      subtitle: null,
      description: null,
      firstPublishedYear: 1970,
      originalLanguage: 'en',
      cover: null,
      contributions: [
        {
          authorName: author,
          role: 'author',
          position: 0,
          sourceLink: { source: 'stub', entityType: 'author', sourceId: `author-${id}` },
        },
      ],
      series: series
        ? [
            {
              name: series,
              position: 1,
            },
          ]
        : [],
      subjects: [],
    },
    editions: [
      {
        isbn13: isbn13 ?? null,
        format: 'paperback',
        language: 'en',
        title: null,
        publisherName: null,
        publishedDate: null,
        pageCount: null,
        cover: null,
        sourceLink: { source: 'stub', entityType: 'edition', sourceId: `edition-${id}` },
      },
    ],
    sourceLink: { source: 'stub', entityType: 'book', sourceId: `book-${id}-${counter}` },
    confidence: 1,
  }
  const result = await ingestBook(stack.db.db, {
    source: stub,
    candidate,
    authorRecords: new Map([
      [
        `author-${id}`,
        {
          name: author,
          alternateNames: [],
          bio: null,
          birthDate: null,
          deathDate: null,
          photo: null,
          sourceLink: { source: 'stub', entityType: 'author', sourceId: `author-${id}` },
        },
      ],
    ]),
  })
  return result.bookId
}

async function titlesFor(q: string): Promise<string[]> {
  const hits = await searchCatalogBooks(stack.db.db, { q, limit: 20 })
  const rows = await stack.db.db.select({ id: books.id, title: books.title }).from(books)
  const byId = new Map(rows.map((row) => [row.id, row.title]))
  return hits.map((hit) => byId.get(hit.id) ?? '?')
}

async function seedShelf() {
  await store({
    id: 'lhod',
    title: 'The Left Hand of Darkness',
    author: 'Ursula K. Le Guin',
    isbn13: '9780441478125',
    series: 'Hainish Cycle',
  })
  await store({ id: 'dune', title: 'Dune', author: 'Frank Herbert', isbn13: '9780441172719' })
  await store({ id: 'mis', title: 'Les Misérables', author: 'Victor Hugo' })
  await store({ id: 'hobbit', title: 'The Hobbit', author: 'J. R. R. Tolkien' })
}

describe('Catalog search', () => {
  it('finds Books by title words, including a prefix of the last word', async () => {
    await seedShelf()
    expect(await titlesFor('left hand darkness')).toEqual(['The Left Hand of Darkness'])
    expect(await titlesFor('left han')).toEqual(['The Left Hand of Darkness'])
  })

  it('finds Books by Author name and by Series name', async () => {
    await seedShelf()
    expect(await titlesFor('herbert')).toEqual(['Dune'])
    expect(await titlesFor('hainish')).toEqual(['The Left Hand of Darkness'])
  })

  it('finds Books by ISBN-13 and by ISBN-10, with or without hyphens', async () => {
    await seedShelf()
    expect(await titlesFor('9780441478125')).toEqual(['The Left Hand of Darkness'])
    expect(await titlesFor('978-0-441-47812-5')).toEqual(['The Left Hand of Darkness'])
    expect(await titlesFor('0441478123')).toEqual(['The Left Hand of Darkness'])
  })

  it('tolerates typos in titles and Author names (trigram)', async () => {
    await seedShelf()
    expect(await titlesFor('lefft hand of darknes')).toContain('The Left Hand of Darkness')
    expect(await titlesFor('frank hebert')).toContain('Dune')
    expect(await titlesFor('hainsh cycle')).toContain('The Left Hand of Darkness')
  })

  it('ignores accents in the query and in the stored text (unaccent)', async () => {
    await seedShelf()
    expect(await titlesFor('miserables')).toEqual(['Les Misérables'])
    expect(await titlesFor('Misérables')).toEqual(['Les Misérables'])
  })

  it('matches nothing for unrelated text, short text, and query syntax', async () => {
    await seedShelf()
    expect(await titlesFor('zzzzqqqq')).toEqual([])
    expect(await titlesFor('d')).toEqual([])
    expect(await titlesFor("dune' | & ! ( :*")).toEqual(['Dune'])
    expect(await titlesFor('   ')).toEqual([])
  })

  it('ranks a title match above a weaker match and pages with offset', async () => {
    await seedShelf()
    await store({ id: 'dune2', title: 'Dune Messiah', author: 'Frank Herbert' })
    const first = await titlesFor('dune')
    expect(first[0]).toBe('Dune')
    expect(first).toContain('Dune Messiah')
    const page = await searchCatalogBooks(stack.db.db, { q: 'dune', limit: 1, offset: 1 })
    expect(page).toHaveLength(1)
  })

  it('breaks ties by review count', async () => {
    const a = await store({ id: 'a', title: 'Twin Peaks', author: 'Author A' })
    const b = await store({ id: 'b', title: 'Twin Peaks', author: 'Author B' })
    await stack.db.db
      .update(books)
      .set({ reviewCount: 4, ratingSum: 16, ratingCounts: [0, 0, 0, 4, 0] })
      .where(eq(books.id, b))
    const hits = await searchCatalogBooks(stack.db.db, { q: 'twin peaks', limit: 5 })
    expect(hits.map((hit) => hit.id)).toEqual([b, a])
  })

  it('finds Authors by name, alternate name, prefix, and typo', async () => {
    await seedShelf()
    const names = async (q: string) => {
      const hits = await searchCatalogAuthors(stack.db.db, { q, limit: 5 })
      const response = await app.inject({
        method: 'GET',
        url: `/v1/search/suggest?q=${encodeURIComponent(q)}`,
      })
      expect(response.statusCode).toBe(200)
      return {
        count: hits.length,
        authors: searchSuggestResponseSchema.parse(response.json()).authors.map((a) => a.name),
      }
    }
    expect((await names('le guin')).authors).toEqual(['Ursula K. Le Guin'])
    expect((await names('tolk')).authors).toEqual(['J. R. R. Tolkien'])
    expect((await names('herbert')).authors).toEqual(['Frank Herbert'])
    expect((await names('victor hugo')).authors).toEqual(['Victor Hugo'])
    expect((await names('frank hebert')).authors).toEqual(['Frank Herbert'])
    expect((await names('100%')).count).toBe(0)
  })
})

describe('GET /v1/search/suggest', () => {
  it('returns Books and Authors from the Catalog and never calls the Source', async () => {
    await seedShelf()
    sourceCalls = 0
    const response = await app.inject({ method: 'GET', url: '/v1/search/suggest?q=herb' })
    expect(response.statusCode).toBe(200)
    const body = searchSuggestResponseSchema.parse(response.json())
    expect(body.books.map((book) => book.title)).toEqual(['Dune'])
    expect(body.books[0]?.contributions[0]?.author.name).toBe('Frank Herbert')
    expect(body.authors.map((author) => author.name)).toEqual(['Frank Herbert'])
    expect(sourceCalls).toBe(0)
    expect(response.headers['cache-control']).toContain('stale-while-revalidate')
    expect(response.headers.etag).toBeTruthy()
    expect(response.body).not.toMatch(/source_?id/i)
  })

  it('suggests nothing for a query under 2 characters', async () => {
    await seedShelf()
    for (const url of [
      '/v1/search/suggest?q=d',
      '/v1/search/suggest?q=%20d%20',
      '/v1/search/suggest',
    ]) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ books: [], authors: [] })
    }
    expect(sourceCalls).toBe(0)
  })

  it('rejects a query over 100 characters with Problem Details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/search/suggest?q=${'a'.repeat(101)}`,
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].path).toContain('q')
  })
})
