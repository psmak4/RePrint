import { authors, books, contributions, editions, sourceRecords } from '@reprint/db'
import {
  authorDetailSchema,
  bookDetailSchema,
  bookEditionsResponseSchema,
  problemDetailsSchema,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { purgeSourceRecords, refreshBook, STALE_AFTER_MS } from '../../catalog/refresh.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const stub = createStubSource()
const queued: { name: string; payload: unknown; options: unknown }[] = []

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
    jobs: {
      enqueue: async (name, payload, options) => {
        queued.push({ name, payload, options })
        return '1'
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
  queued.length = 0
  await stack.reset()
})

async function ingest(sourceId: string, authorSourceId: string) {
  const candidate = await stub.getBook(sourceId)
  const author = await stub.getAuthor(authorSourceId)
  if (!candidate || !author) throw new Error('missing stub data')
  return ingestBook(stack.db.db, {
    source: stub,
    candidate,
    authorRecords: new Map([[authorSourceId, author]]),
  })
}

describe('GET /v1/books/:slug', () => {
  it('returns the Book with its Primary Edition, byline, and empty rating summary', async () => {
    const { slug } = await ingest('stub-book-dune', 'stub-author-herbert')
    const response = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
    expect(response.statusCode).toBe(200)
    const body = bookDetailSchema.parse(response.json())
    expect(body.title).toBe('Dune')
    expect(body.contributions[0]?.author.name).toBe('Frank Herbert')
    expect(body.primaryEdition?.isbn13).not.toBeNull()
    expect(body.rating).toEqual({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] })
  })

  it('reports the average from the cached aggregates', async () => {
    const { slug, bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
    await stack.db.db
      .update(books)
      .set({ reviewCount: 3, ratingSum: 13, ratingCounts: [0, 0, 1, 1, 1] })
      .where(eq(books.id, bookId))
    const response = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
    expect(bookDetailSchema.parse(response.json()).rating).toEqual({
      average: 4.33,
      count: 3,
      distribution: [0, 0, 1, 1, 1],
    })
  })

  it('returns 404 Problem Details for an unknown slug and 400 for a malformed one', async () => {
    const missing = await app.inject({ method: 'GET', url: '/v1/books/no-such-book-abc123' })
    expect(missing.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(missing.json()).status).toBe(404)
    const malformed = await app.inject({ method: 'GET', url: '/v1/books/Not_A_Slug' })
    expect(malformed.statusCode).toBe(400)
  })

  it('contains no Source IDs anywhere in the JSON', async () => {
    const { slug } = await ingest('stub-book-dune', 'stub-author-herbert')
    const editionsResponse = await app.inject({ method: 'GET', url: `/v1/books/${slug}/editions` })
    const authorResponse = await app.inject({ method: 'GET', url: '/v1/authors/frank-herbert' })
    const bookResponse = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
    for (const text of [editionsResponse.body, authorResponse.body, bookResponse.body]) {
      expect(text).not.toContain('stub-')
      expect(text).not.toContain('source_id')
      expect(text).not.toContain('sourceId')
    }
  })

  describe('caching', () => {
    it('sets Cache-Control and an ETag, and answers If-None-Match with 304', async () => {
      const { slug } = await ingest('stub-book-dune', 'stub-author-herbert')
      const first = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
      expect(first.headers['cache-control']).toMatch(/stale-while-revalidate=\d+/)
      const etag = first.headers.etag
      expect(etag).toBeTruthy()
      const again = await app.inject({
        method: 'GET',
        url: `/v1/books/${slug}`,
        headers: { 'if-none-match': String(etag) },
      })
      expect(again.statusCode).toBe(304)
      expect(again.body).toBe('')
      const changed = await app.inject({
        method: 'GET',
        url: `/v1/books/${slug}`,
        headers: { 'if-none-match': 'W/"other"' },
      })
      expect(changed.statusCode).toBe(200)
    })

    it('does not cache errors', async () => {
      const missing = await app.inject({ method: 'GET', url: '/v1/books/no-such-book-abc123' })
      expect(missing.headers['cache-control']).toBeUndefined()
      expect(missing.headers.etag).toBeUndefined()
    })
  })

  describe('refresh', () => {
    it('queues a low-priority refresh for a Book more than 30 days old, once a day', async () => {
      const { slug, bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
      await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
      expect(queued).toEqual([])

      await stack.db.db
        .update(books)
        .set({ refreshedAt: new Date(Date.now() - STALE_AFTER_MS - 60_000) })
        .where(eq(books.id, bookId))
      await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
      expect(queued).toHaveLength(1)
      expect(queued[0]).toMatchObject({
        name: 'catalog.refresh',
        payload: { bookId },
        options: { priority: expect.any(Number) },
      })
      const options = queued[0]?.options as { jobId: string; priority: number }
      expect(options.priority).toBeGreaterThan(1)
      expect(options.jobId).toContain(bookId)
    })

    it('refreshes from the Source and keeps admin-locked fields', async () => {
      const { bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
      await stack.db.db
        .update(books)
        .set({
          title: 'Dune (admin title)',
          lockedFields: ['title'],
          fieldOrigins: { title: { source: 'admin', at: new Date().toISOString() } },
          firstPublishedYear: null,
          refreshedAt: new Date(Date.now() - STALE_AFTER_MS - 60_000),
        })
        .where(eq(books.id, bookId))
      const outcome = await refreshBook({ db: stack.db.db, source: stub, bookId })
      expect(outcome).toBe('refreshed')
      const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
      expect(book?.title).toBe('Dune (admin title)')
      expect(book?.firstPublishedYear).toBe(1937)
      expect(Date.now() - (book?.refreshedAt?.getTime() ?? 0)).toBeLessThan(60_000)
    })

    it('does not fail the page view when the queue is down', async () => {
      const { slug, bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
      await stack.db.db.update(books).set({ refreshedAt: null }).where(eq(books.id, bookId))
      const failing = await buildApp(
        loadEnv({
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          WEB_ORIGINS: 'http://www.reprint.test:5173',
          DATABASE_URL: stack.databaseUrl,
          REDIS_URL: stack.redisUrl,
        }),
        {
          database: stack.db.db,
          redis: stack.redis,
          jobs: {
            enqueue: async () => {
              throw new Error('redis is down')
            },
          },
        },
      )
      try {
        const response = await failing.inject({ method: 'GET', url: `/v1/books/${slug}` })
        expect(response.statusCode).toBe(200)
      } finally {
        await failing.close()
      }
    })
  })
})

describe('GET /v1/books/:slug/editions', () => {
  it('lists every Edition of the Book', async () => {
    const { slug, bookId } = await ingest('stub-book-dune', 'stub-author-herbert')
    const response = await app.inject({ method: 'GET', url: `/v1/books/${slug}/editions` })
    expect(response.statusCode).toBe(200)
    const body = bookEditionsResponseSchema.parse(response.json())
    const stored = await stack.db.db.select().from(editions).where(eq(editions.bookId, bookId))
    expect(body.items).toHaveLength(stored.length)
    expect(body.items.every((item) => item.bookId === bookId)).toBe(true)
  })

  it('returns 404 for an unknown Book', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/books/no-such-book-abc123/editions',
    })
    expect(response.statusCode).toBe(404)
  })
})

describe('GET /v1/authors/:slug', () => {
  it('lists the Author’s Books grouped by Role, most reviewed first', async () => {
    const first = await ingest('stub-book-dune', 'stub-author-herbert')
    const [author] = await stack.db.db.select().from(authors)
    if (!author) throw new Error('no author stored')
    await stack.db.db
      .update(books)
      .set({ reviewCount: 2, ratingSum: 8, ratingCounts: [0, 0, 0, 2, 0] })
      .where(eq(books.id, first.bookId))
    const response = await app.inject({ method: 'GET', url: `/v1/authors/${author.slug}` })
    expect(response.statusCode).toBe(200)
    const body = authorDetailSchema.parse(response.json())
    expect(body.name).toBe('Frank Herbert')
    expect(body.works[0]?.role).toBe('author')
    expect(body.works[0]?.books[0]?.rating.average).toBe(4)
    const links = await stack.db.db
      .select()
      .from(contributions)
      .where(eq(contributions.authorId, author.id))
    expect(links.length).toBeGreaterThan(0)
  })

  it('returns 404 Problem Details for an unknown slug', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/authors/nobody' })
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).title).toBe('Not Found')
  })
})

describe('catalog.purgeSourceRecords', () => {
  it('deletes Source records older than 30 days and keeps newer ones', async () => {
    const now = new Date()
    const old = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
    const recent = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)
    await stack.db.db.insert(sourceRecords).values([
      { source: 'stub', sourceId: 'a', payload: {}, fetchedAt: old },
      { source: 'stub', sourceId: 'b', payload: {}, fetchedAt: recent },
    ])
    expect(await purgeSourceRecords(stack.db.db, now)).toBe(1)
    const left = await stack.db.db.select().from(sourceRecords)
    expect(left.map((row) => row.sourceId)).toEqual(['b'])
  })
})
