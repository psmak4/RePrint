import {
  authors,
  bookSeries,
  books,
  contributions,
  newId,
  reviews,
  series,
  shelfEntries,
} from '@reprint/db'
import {
  bookDetailSchema,
  discoverResponseSchema,
  searchResponseSchema,
  seriesDetailResponseSchema,
} from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const BODY = 'A thoughtful review that is comfortably longer than fifty characters.'

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
    catalog: { source: createStubSource(), interactive: (fn) => fn() },
  })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  await stack.reset()
})

const db = () => stack.db.db

async function member() {
  const user = await createTestUser(db())
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function makeBook(slug: string, title = slug) {
  const [book] = await db().insert(books).values({ id: newId(), slug, title }).returning()
  if (!book) throw new Error('book not stored')
  const [author] = await db()
    .insert(authors)
    .values({ id: newId(), slug: `author-${slug}`, name: `Author of ${slug}` })
    .returning()
  if (!author) throw new Error('author not stored')
  await db()
    .insert(contributions)
    .values({ bookId: book.id, authorId: author.id, role: 'author', position: 0 })
  return book
}

describe('viewerShelf on Book responses', () => {
  it('GET /books/:slug: Members get their Shelf or null, Visitors get no field', async () => {
    const shelved = await makeBook('shelved')
    await makeBook('unshelved')
    const { user, cookies } = await member()
    await db()
      .insert(shelfEntries)
      .values({ userId: user.id, bookId: shelved.id, shelf: 'reading' })

    const mine = await app.inject({ method: 'GET', url: '/v1/books/shelved', cookies })
    expect(bookDetailSchema.parse(mine.json()).viewerShelf).toBe('reading')
    const none = await app.inject({ method: 'GET', url: '/v1/books/unshelved', cookies })
    expect(bookDetailSchema.parse(none.json()).viewerShelf).toBeNull()

    const visitor = await app.inject({ method: 'GET', url: '/v1/books/shelved' })
    expect(visitor.statusCode).toBe(200)
    expect(visitor.json()).not.toHaveProperty('viewerShelf')
  })

  it("does not show one Member's Shelf to another", async () => {
    const book = await makeBook('shared')
    const owner = await member()
    const other = await member()
    await db()
      .insert(shelfEntries)
      .values({ userId: owner.user.id, bookId: book.id, shelf: 'read' })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/books/shared',
      cookies: other.cookies,
    })
    expect(bookDetailSchema.parse(response.json()).viewerShelf).toBeNull()
  })

  it('GET /series/:slug adds viewerShelf to each Book', async () => {
    const [found] = await db()
      .insert(series)
      .values({ slug: 'trilogy', name: 'Trilogy' })
      .returning()
    if (!found) throw new Error('series not stored')
    const one = await makeBook('part-one')
    const two = await makeBook('part-two')
    await db()
      .insert(bookSeries)
      .values([
        { bookId: one.id, seriesId: found.id, position: 1 },
        { bookId: two.id, seriesId: found.id, position: 2 },
      ])
    const { user, cookies } = await member()
    await db()
      .insert(shelfEntries)
      .values({ userId: user.id, bookId: two.id, shelf: 'want_to_read' })

    const mine = await app.inject({ method: 'GET', url: '/v1/series/trilogy', cookies })
    const items = seriesDetailResponseSchema.parse(mine.json()).items
    expect(items.map((item) => item.book.viewerShelf)).toEqual([null, 'want_to_read'])
    const visitor = await app.inject({ method: 'GET', url: '/v1/series/trilogy' })
    expect(visitor.json().items[0].book).not.toHaveProperty('viewerShelf')
  })

  it('GET /search adds viewerShelf to Catalog Books', async () => {
    const book = await makeBook('zanzibar-chronicles', 'Zanzibar Chronicles')
    const { user, cookies } = await member()
    await db().insert(shelfEntries).values({ userId: user.id, bookId: book.id, shelf: 'read' })

    const mine = await app.inject({ method: 'GET', url: '/v1/search?q=Zanzibar', cookies })
    expect(mine.statusCode).toBe(200)
    const found = searchResponseSchema
      .parse(mine.json())
      .items.flatMap((item) => (item.kind === 'book' ? [item.book] : []))
      .find((entry) => entry.slug === 'zanzibar-chronicles')
    expect(found?.viewerShelf).toBe('read')

    const visitor = await app.inject({ method: 'GET', url: '/v1/search?q=Zanzibar' })
    for (const item of visitor.json().items) {
      if (item.kind === 'book') expect(item.book).not.toHaveProperty('viewerShelf')
    }
  })

  it('GET /discover adds viewerShelf per Member without changing the shared rows', async () => {
    const made = []
    for (let i = 0; i < 6; i++) {
      const book = await makeBook(`row-${i}`)
      const author = await createTestUser(db())
      await db().insert(reviews).values({
        userId: author.id,
        bookId: book.id,
        rating: 4,
        body: BODY,
        status: 'approved',
        decidedAt: new Date(),
      })
      made.push(book)
    }
    const first = made[0]
    if (!first) throw new Error('no books')
    const { user, cookies } = await member()
    await db().insert(shelfEntries).values({ userId: user.id, bookId: first.id, shelf: 'reading' })

    const mine = await app.inject({ method: 'GET', url: '/v1/discover', cookies })
    const row = discoverResponseSchema.parse(mine.json()).recentlyReviewed
    expect(row).toHaveLength(6)
    expect(row?.find((book) => book.slug === 'row-0')?.viewerShelf).toBe('reading')
    expect(row?.find((book) => book.slug === 'row-1')?.viewerShelf).toBeNull()

    // A Visitor right after gets the shared rows, with no trace of the Member's Shelves.
    const visitor = await app.inject({ method: 'GET', url: '/v1/discover' })
    expect(JSON.stringify(visitor.json())).not.toContain('viewerShelf')
  })
})

describe('caching of responses with viewer data', () => {
  const urls = ['/v1/books/cached', '/v1/series/cached-series']

  it('is private for Members and public, varying on Cookie, for Visitors', async () => {
    const book = await makeBook('cached')
    const [found] = await db()
      .insert(series)
      .values({ slug: 'cached-series', name: 'S' })
      .returning()
    if (!found) throw new Error('series not stored')
    await db().insert(bookSeries).values({ bookId: book.id, seriesId: found.id, position: 1 })
    const { cookies } = await member()

    for (const url of [...urls, '/v1/discover']) {
      const mine = await app.inject({ method: 'GET', url, cookies })
      expect(mine.headers['cache-control']).toContain('private')
      expect(mine.headers['cache-control']).not.toContain('public')
      expect(mine.headers.vary).toContain('Cookie')
      const visitor = await app.inject({ method: 'GET', url })
      expect(visitor.headers['cache-control']).toContain('public')
      expect(visitor.headers.vary).toContain('Cookie')
    }
  })
})
