import { bookGenres, books, genres, reviews, users } from '@reprint/db'
import {
  GENRE_PAGE_SIZE,
  genreDetailResponseSchema,
  genreTreeResponseSchema,
  problemDetailsSchema,
} from '@reprint/shared'
import { eq, like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

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
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  await stack.reset()
  // Genres are reference data that `reset` keeps, so remove the ones these tests add.
  await stack.db.db.delete(genres).where(like(genres.slug, 'zz-%'))
})

const db = () => stack.db.db

async function makeGenre(slug: string, parentSlug?: string) {
  const parent = parentSlug
    ? (await db().select().from(genres).where(eq(genres.slug, parentSlug)))[0]
    : undefined
  const [row] = await db()
    .insert(genres)
    .values({ slug, name: slug.toUpperCase(), parentId: parent?.id ?? null })
    .returning()
  if (!row) throw new Error('genre not stored')
  return row
}

async function makeBook(
  slug: string,
  genreId: string | null,
  { count = 0, sum = 0 }: { count?: number; sum?: number } = {},
) {
  const [row] = await db()
    .insert(books)
    .values({ slug, title: slug, reviewCount: count, ratingSum: sum })
    .returning()
  if (!row) throw new Error('book not stored')
  if (genreId) await db().insert(bookGenres).values({ bookId: row.id, genreId })
  return row
}

async function get(url: string) {
  return app.inject({ method: 'GET', url })
}

describe('GET /v1/genres', () => {
  it('returns the Genre tree with children under their parent', async () => {
    await makeGenre('zz-parent')
    await makeGenre('zz-child-b', 'zz-parent')
    await makeGenre('zz-child-a', 'zz-parent')
    const response = await get('/v1/genres')
    expect(response.statusCode).toBe(200)
    const { items } = genreTreeResponseSchema.parse(response.json())
    const parent = items.find((node) => node.slug === 'zz-parent')
    expect(parent?.children.map((child) => child.slug)).toEqual(['zz-child-a', 'zz-child-b'])
    // Children appear only under their parent.
    expect(items.some((node) => node.slug === 'zz-child-a')).toBe(false)
  })
})

describe('GET /v1/genres/:slug', () => {
  it('lists Books in the Genre and its child Genres, and links the family', async () => {
    const parent = await makeGenre('zz-parent')
    const child = await makeGenre('zz-child', 'zz-parent')
    const other = await makeGenre('zz-other')
    await makeBook('in-parent', parent.id)
    await makeBook('in-child', child.id)
    await makeBook('elsewhere', other.id)
    await makeBook('uncategorised', null)

    const parentBody = genreDetailResponseSchema.parse((await get('/v1/genres/zz-parent')).json())
    expect(parentBody.items.map((book) => book.slug).sort()).toEqual(['in-child', 'in-parent'])
    expect(parentBody.children).toEqual([{ slug: 'zz-child', name: 'ZZ-CHILD' }])
    expect(parentBody.parent).toBeNull()

    const childBody = genreDetailResponseSchema.parse((await get('/v1/genres/zz-child')).json())
    expect(childBody.items.map((book) => book.slug)).toEqual(['in-child'])
    expect(childBody.parent).toEqual({ slug: 'zz-parent', name: 'ZZ-PARENT' })
  })

  it('paginates with hasMore and no overlap between pages', async () => {
    const genre = await makeGenre('zz-big')
    for (let i = 0; i < GENRE_PAGE_SIZE + 3; i++) await makeBook(`big-${i}`, genre.id)
    const one = genreDetailResponseSchema.parse((await get('/v1/genres/zz-big')).json())
    const two = genreDetailResponseSchema.parse((await get('/v1/genres/zz-big?page=2')).json())
    expect(one.items).toHaveLength(GENRE_PAGE_SIZE)
    expect(one.hasMore).toBe(true)
    expect(two.items).toHaveLength(3)
    expect(two.hasMore).toBe(false)
    const ids = new Set([...one.items, ...two.items].map((book) => book.id))
    expect(ids.size).toBe(GENRE_PAGE_SIZE + 3)
  })

  it('top_rated uses the weighted average, so one 5-star review does not beat many good ones', async () => {
    const genre = await makeGenre('zz-rank')
    // A large, lower-rated catalog elsewhere keeps the site-wide mean well below both Books.
    await makeBook('elsewhere', null, { count: 100, sum: 280 })
    await makeBook('single-five', genre.id, { count: 1, sum: 5 })
    await makeBook('many-good', genre.id, { count: 40, sum: 40 * 4.5 })
    await makeBook('unrated', genre.id)
    const body = genreDetailResponseSchema.parse((await get('/v1/genres/zz-rank')).json())
    expect(body.items.map((book) => book.slug)).toEqual(['many-good', 'single-five', 'unrated'])
  })

  it('most_reviewed orders by review count', async () => {
    const genre = await makeGenre('zz-count')
    await makeBook('few', genre.id, { count: 2, sum: 10 })
    await makeBook('lots', genre.id, { count: 9, sum: 27 })
    const body = genreDetailResponseSchema.parse(
      (await get('/v1/genres/zz-count?sort=most_reviewed')).json(),
    )
    expect(body.items.map((book) => book.slug)).toEqual(['lots', 'few'])
  })

  it('newest_review orders by the latest Approved review, ignoring other statuses', async () => {
    const genre = await makeGenre('zz-new')
    const older = await makeBook('older', genre.id, { count: 1, sum: 4 })
    const newer = await makeBook('newer', genre.id, { count: 1, sum: 4 })
    const pendingOnly = await makeBook('pending-only', genre.id)
    await makeBook('none', genre.id)
    const [user] = await db()
      .insert(users)
      .values({ email: 'rev@example.test', username: 'rev', passwordHash: 'x', displayName: 'Rev' })
      .returning()
    if (!user) throw new Error('user not stored')
    const body = 'x'.repeat(60)
    const review = (bookId: string, status: 'approved' | 'pending', decidedAt: Date | null) =>
      db().insert(reviews).values({ userId: user.id, bookId, rating: 4, body, status, decidedAt })
    await review(older.id, 'approved', new Date('2026-01-01T00:00:00Z'))
    await review(newer.id, 'approved', new Date('2026-06-01T00:00:00Z'))
    await review(pendingOnly.id, 'pending', null)
    const response = await get('/v1/genres/zz-new?sort=newest_review')
    const result = genreDetailResponseSchema.parse(response.json())
    expect(result.items.slice(0, 2).map((book) => book.slug)).toEqual(['newer', 'older'])
  })

  it('returns 404 Problem Details for an unknown slug', async () => {
    const response = await get('/v1/genres/nope')
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(404)
  })

  it('rejects an unknown sort with 400', async () => {
    const response = await get('/v1/genres/fantasy?sort=bogus')
    expect(response.statusCode).toBe(400)
  })
})
