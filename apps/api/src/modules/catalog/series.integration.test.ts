import { bookSeries, books, series } from '@reprint/db'
import { problemDetailsSchema, seriesDetailResponseSchema } from '@reprint/shared'
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
})

const db = () => stack.db.db

async function makeSeries(slug: string) {
  const [row] = await db().insert(series).values({ slug, name: slug.toUpperCase() }).returning()
  if (!row) throw new Error('series not stored')
  return row
}

async function addBook(
  seriesId: string,
  slug: string,
  position: number | null,
  count = 0,
  sum = 0,
) {
  const [row] = await db()
    .insert(books)
    .values({ slug, title: slug, reviewCount: count, ratingSum: sum })
    .returning()
  if (!row) throw new Error('book not stored')
  await db().insert(bookSeries).values({ bookId: row.id, seriesId, position })
  return row
}

describe('GET /v1/series/:slug', () => {
  it('lists Books in reading order with decimal positions, empty positions last', async () => {
    const found = await makeSeries('expanse')
    await addBook(found.id, 'no-position-b', null)
    await addBook(found.id, 'book-three', 3)
    await addBook(found.id, 'novella', 2.5)
    await addBook(found.id, 'book-two', 2)
    await addBook(found.id, 'book-one', 1, 4, 18)
    await addBook(found.id, 'no-position-a', null)
    const other = await makeSeries('other')
    await addBook(other.id, 'elsewhere', 1)

    const response = await app.inject({ method: 'GET', url: '/v1/series/expanse' })
    expect(response.statusCode).toBe(200)
    const body = seriesDetailResponseSchema.parse(response.json())
    expect(body.series).toEqual({ slug: 'expanse', name: 'EXPANSE', description: null })
    expect(body.items.map((entry) => [entry.book.slug, entry.position])).toEqual([
      ['book-one', 1],
      ['book-two', 2],
      ['novella', 2.5],
      ['book-three', 3],
      ['no-position-a', null],
      ['no-position-b', null],
    ])
    expect(body.items[0]?.book.rating.count).toBe(4)
    expect(body.items[0]?.book.rating.average).toBe(4.5)
  })

  it('answers 200 with no Books for an empty Series', async () => {
    await makeSeries('empty')
    const response = await app.inject({ method: 'GET', url: '/v1/series/empty' })
    expect(seriesDetailResponseSchema.parse(response.json()).items).toEqual([])
  })

  it('returns 404 Problem Details for an unknown slug', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/series/nope' })
    expect(response.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(404)
  })
})
