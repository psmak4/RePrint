import { authors, books, genres, series } from '@reprint/db'
import { type SitemapUrl, sitemapChunkSchema, sitemapIndexSchema } from '@reprint/shared'
import { like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { jobs } from '../../jobs/registry.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'

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
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  await stack.reset()
  await stack.db.db.delete(genres).where(like(genres.slug, 'zz-%'))
  const keys = await stack.redis.keys('sitemap:v1:*')
  if (keys.length > 0) await stack.redis.del(keys)
})

const db = () => stack.db.db

async function build(chunkSize?: number) {
  return jobs['sitemaps.build'].handler({ chunkSize }, {
    log: pino({ level: 'silent' }),
    db: db(),
    redis: stack.redis,
  } as never)
}

async function allUrls(): Promise<SitemapUrl[]> {
  const index = sitemapIndexSchema.parse(
    (await app.inject({ method: 'GET', url: '/v1/sitemaps' })).json(),
  )
  const urls: SitemapUrl[] = []
  for (const chunk of index.chunks) {
    const response = await app.inject({ method: 'GET', url: `/v1/sitemaps/${chunk.number}` })
    urls.push(...sitemapChunkSchema.parse(response.json()).urls)
  }
  return urls
}

describe('sitemaps.build', () => {
  it('lists Books, Authors, Genres, Series, and verified Members, and no others', async () => {
    await db().insert(books).values({ slug: 'dune', title: 'Dune' })
    await db().insert(authors).values({ slug: 'frank-herbert', name: 'Frank Herbert' })
    await db().insert(series).values({ slug: 'dune-chronicles', name: 'Dune Chronicles' })
    await db()
      .insert(genres)
      .values([
        { slug: 'zz-live', name: 'Live' },
        { slug: 'zz-gone', name: 'Gone', archivedAt: new Date() },
      ])
    const verified = await createTestUser(db())
    const unverified = await createTestUser(db(), { verified: false })
    const suspended = await createTestUser(db(), { status: 'suspended' })

    await build()
    const paths = (await allUrls()).map((url) => url.path)

    for (const path of [
      '/',
      '/genres',
      '/genres/zz-live',
      '/books/dune',
      '/authors/frank-herbert',
      '/series/dune-chronicles',
      `/u/${verified.username}`,
    ]) {
      expect(paths).toContain(path)
    }
    expect(paths).not.toContain('/genres/zz-gone')
    expect(paths).not.toContain(`/u/${unverified.username}`)
    expect(paths).not.toContain(`/u/${suspended.username}`)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('splits the URLs into chunks of at most the chunk size and drops stale chunks', async () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e']) {
      await db()
        .insert(books)
        .values({ slug: `book-${slug}`, title: slug })
    }
    const first = await build(3)
    expect(first.chunks).toBeGreaterThan(1)
    const index = sitemapIndexSchema.parse(
      (await app.inject({ method: 'GET', url: '/v1/sitemaps' })).json(),
    )
    expect(index.chunks.every((chunk) => chunk.urlCount <= 3)).toBe(true)
    expect(index.chunks.map((chunk) => chunk.number)).toEqual(
      Array.from({ length: first.chunks }, (_, position) => position + 1),
    )

    await build()
    const rebuilt = await app.inject({ method: 'GET', url: `/v1/sitemaps/${first.chunks}` })
    expect(rebuilt.statusCode).toBe(404)
    expect((await allUrls()).map((url) => url.path)).toContain('/books/book-e')
  })

  it('carries each page’s last change as lastModified', async () => {
    const [book] = await db().insert(books).values({ slug: 'dune', title: 'Dune' }).returning()
    await build()
    const url = (await allUrls()).find((entry) => entry.path === '/books/dune')
    expect(url?.lastModified).toBe(book?.updatedAt.toISOString())
  })
})

describe('GET /v1/sitemaps', () => {
  it('serves the index and chunks with public cache headers', async () => {
    await build()
    const response = await app.inject({ method: 'GET', url: '/v1/sitemaps' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toContain('public')
    const chunk = await app.inject({ method: 'GET', url: '/v1/sitemaps/1' })
    expect(chunk.statusCode).toBe(200)
  })

  it('returns 404 Problem Details before the first build', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/sitemaps' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ status: 404 })
  })
})

describe('GET /v1/sitemaps/:number', () => {
  it('returns the chunk', async () => {
    await build()
    const response = await app.inject({ method: 'GET', url: '/v1/sitemaps/1' })
    expect(sitemapChunkSchema.parse(response.json()).urls.length).toBeGreaterThan(0)
  })

  it('returns 404 Problem Details for a chunk that does not exist', async () => {
    await build()
    const response = await app.inject({ method: 'GET', url: '/v1/sitemaps/99' })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ status: 404 })
  })
})
