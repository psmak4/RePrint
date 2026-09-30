import { books } from '@reprint/db'
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
import { resolveCandidate } from '../../catalog/resolve.js'
import { sourceSearchCacheKey } from '../../catalog/search/federated-search.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { type SourceAdapter, SourceError } from '../../catalog/sources/types.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const stub = createStubSource()
/** What the Source does on `searchBooks`; tests swap it to simulate a slow or failing Source. */
let searchBooks: SourceAdapter['searchBooks'] = stub.searchBooks
let searchCalls: Array<{ query: string; page: number }> = []
let cacheEvents: boolean[] = []

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
    SOURCE_SEARCH_TIMEOUT_MS: '200',
  })
  const source: SourceAdapter = {
    ...stub,
    searchBooks: (query, page) => {
      searchCalls.push({ query, page })
      return searchBooks(query, page)
    },
  }
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: { enqueue: async () => '1' },
    catalog: {
      source,
      interactive: (fn) => fn(),
      recordCache: async (hit) => {
        cacheEvents.push(hit)
      },
    },
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  searchBooks = stub.searchBooks
  searchCalls = []
  cacheEvents = []
  await stack.reset()
})

const search = async (q: string, page = 1): Promise<SearchResponse> => {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/search?q=${encodeURIComponent(q)}&page=${page}`,
  })
  expect(response.statusCode, response.body).toBe(200)
  return searchResponseSchema.parse(response.json())
}

async function storeStubBook(sourceId: string) {
  const candidate = await stub.getBook(sourceId)
  if (!candidate) throw new Error('missing stub data')
  const result = await resolveCandidate({
    db: stack.db.db,
    source: stub,
    candidate,
    timeoutMs: 1000,
  })
  if ('notFound' in result) throw new Error('could not store the stub Book')
  return result.slug
}

function candidateOf(sourceId: string, title: string, isbn13: string | null = null): BookCandidate {
  return {
    book: {
      title,
      subtitle: null,
      description: null,
      firstPublishedYear: 2001,
      originalLanguage: 'en',
      cover: null,
      contributions: [{ authorName: 'Some Author', role: 'author', position: 0 }],
      series: [],
      subjects: [],
    },
    editions: [
      {
        isbn13,
        format: 'paperback',
        language: 'en',
        title: null,
        publisherName: null,
        publishedDate: null,
        pageCount: null,
        cover: null,
      },
    ],
    sourceLink: { source: 'stub', entityType: 'book', sourceId },
    confidence: 1,
  }
}

const pageOf = (candidates: BookCandidate[], page = 1, hasMore = false): BookSearchPage => ({
  candidates,
  page,
  hasMore,
})

describe('GET /v1/search', () => {
  it('shows Books the Source found that are not on RePrint yet, with opaque references', async () => {
    const body = await search('dune')
    expect(searchCalls).toHaveLength(1)
    expect(body.sourceUnavailable).toBe(false)
    expect(body.items).toHaveLength(1)
    const [item] = body.items
    if (item?.kind !== 'candidate') throw new Error('expected a candidate')
    expect(item.candidate.title).toBe('Dune')
    expect(item.candidate.contributions).toEqual([{ authorName: 'Frank Herbert', role: 'author' }])
    expect(JSON.stringify(body)).not.toContain('stub-book-dune')
    const stored = await stack.redis.get(`catalog:candidate:${item.candidate.ref}`)
    expect(stored).toContain('stub-book-dune')
  })

  it('caches the Source page for 24 hours, keyed on the normalized query and page', async () => {
    await search('Dune')
    await search('  dune!  ')
    expect(searchCalls).toHaveLength(1)
    expect(cacheEvents).toEqual([false, true])
    const ttl = await stack.redis.ttl(sourceSearchCacheKey('dune', 1))
    expect(ttl).toBeGreaterThan(24 * 60 * 60 - 5)
    await search('dune', 2)
    expect(searchCalls).toHaveLength(2)
  })

  it('shows a candidate that matches a stored Book as that Book, once', async () => {
    const slug = await storeStubBook('stub-book-dune')
    const body = await search('dune')
    expect(body.items).toHaveLength(1)
    const [item] = body.items
    if (item?.kind !== 'book') throw new Error('expected the stored Book')
    expect(item.book.slug).toBe(slug)
    expect(item.book.firstPublishedYear).toBe(1937)
  })

  it('matches a candidate to a stored Book by ISBN-13 when the Source link differs', async () => {
    const slug = await storeStubBook('stub-book-dune')
    searchBooks = async () =>
      pageOf([candidateOf('another-dune-id', 'Dune (new printing)', '9780441172719')])
    const body = await search('dune')
    expect(body.items.map((item) => item.kind)).toEqual(['book'])
    expect(body.items[0]?.kind === 'book' && body.items[0].book.slug).toBe(slug)
  })

  it('ranks a stored, reviewed Book above an equally relevant Book not yet on RePrint', async () => {
    const slug = await storeStubBook('stub-book-hobbit')
    await stack.db.db
      .update(books)
      .set({ reviewCount: 3, ratingSum: 12, ratingCounts: [0, 0, 0, 3, 0] })
      .where(eq(books.slug, slug))
    const hobbit = await stub.getBook('stub-book-hobbit')
    if (!hobbit) throw new Error('missing stub data')
    searchBooks = async () => pageOf([candidateOf('unknown-1', 'The Hobbit Reimagined'), hobbit])
    const body = await search('hobbit')
    expect(body.items.map((item) => item.kind)).toEqual(['book', 'candidate'])
  })

  it('returns Catalog results alone when the Source is slower than the limit', async () => {
    await storeStubBook('stub-book-dune')
    searchBooks = () => new Promise((resolve) => setTimeout(() => resolve(pageOf([])), 1000))
    const started = Date.now()
    const body = await search('dune')
    expect(Date.now() - started).toBeLessThan(800)
    expect(body.sourceUnavailable).toBe(true)
    expect(body.items.map((item) => item.kind)).toEqual(['book'])
  })

  it('returns Catalog results alone, and does not cache, when the Source fails', async () => {
    await storeStubBook('stub-book-dune')
    searchBooks = async () => {
      throw new SourceError('The Source circuit breaker is open')
    }
    const body = await search('dune')
    expect(body.sourceUnavailable).toBe(true)
    expect(body.items).toHaveLength(1)
    searchBooks = stub.searchBooks
    expect((await search('dune')).sourceUnavailable).toBe(false)
    expect(searchCalls).toHaveLength(2)
  })

  it('asks the Source for the matching page on later pages and drops Books already shown', async () => {
    const slug = await storeStubBook('stub-book-dune')
    const dune = await stub.getBook('stub-book-dune')
    if (!dune) throw new Error('missing stub data')
    searchBooks = async (_query, page) =>
      page === 1 ? pageOf([], 1, true) : pageOf([dune, candidateOf('later-1', 'Dune Messiah')], 2)
    const first = await search('dune')
    expect(first.items.map((item) => item.kind === 'book' && item.book.slug)).toEqual([slug])
    expect(first.hasMore).toBe(true)
    const second = await search('dune', 2)
    expect(searchCalls.at(-1)).toEqual({ query: 'dune', page: 2 })
    expect(second.page).toBe(2)
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.kind === 'candidate' && second.items[0].candidate.title).toBe(
      'Dune Messiah',
    )
  })

  it('returns nothing, without asking the Source, for a query under 2 characters', async () => {
    const body = await search('d')
    expect(body.items).toEqual([])
    expect(searchCalls).toHaveLength(0)
  })

  it('rejects a page below 1 with Problem Details', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/search?q=dune&page=0' })
    expect(response.statusCode).toBe(400)
    expect(problemDetailsSchema.safeParse(response.json()).success).toBe(true)
  })
})
