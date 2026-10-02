import { books, newId, reviews, shelfEntries } from '@reprint/db'
import { shelfResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
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

async function member(options: { verified?: boolean } = {}) {
  const user = await createTestUser(stack.db.db, options)
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function newBook() {
  const id = newId()
  const slug = `book-${id.slice(-8)}`
  await stack.db.db.insert(books).values({ id, slug, title: 'A Book' })
  return { id, slug }
}

function shelve(slug: string, shelf: string, cookies?: Record<string, string>) {
  return app.inject({
    method: 'PUT',
    url: `/v1/books/${slug}/shelf`,
    cookies,
    headers: { origin: ORIGIN },
    payload: { shelf },
  })
}

function unshelve(slug: string, cookies?: Record<string, string>) {
  return app.inject({
    method: 'DELETE',
    url: `/v1/books/${slug}/shelf`,
    cookies,
    headers: { origin: ORIGIN },
  })
}

async function entriesFor(userId: string) {
  return stack.db.db.select().from(shelfEntries).where(eq(shelfEntries.userId, userId))
}

describe('PUT/DELETE /v1/books/:slug/shelf', () => {
  it('puts a Book on a Shelf and replaces it', async () => {
    const { user, cookies } = await member()
    const book = await newBook()

    const first = await shelve(book.slug, 'want_to_read', cookies)
    expect(first.statusCode).toBe(200)
    expect(shelfResponseSchema.parse(first.json())).toEqual({ shelf: 'want_to_read' })
    const [before] = await entriesFor(user.id)

    const second = await shelve(book.slug, 'reading', cookies)
    expect(second.json()).toEqual({ shelf: 'reading' })
    const rows = await entriesFor(user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.shelf).toBe('reading')
    expect(rows[0]?.id).toBe(before?.id)
    expect(rows[0]?.addedAt).toEqual(before?.addedAt)
  })

  it('keeps one entry per Member per Book, and Members apart', async () => {
    const a = await member()
    const b = await member()
    const book = await newBook()
    await shelve(book.slug, 'read', a.cookies)
    await shelve(book.slug, 'reading', b.cookies)
    expect((await entriesFor(a.user.id))[0]?.shelf).toBe('read')
    expect((await entriesFor(b.user.id))[0]?.shelf).toBe('reading')
  })

  it('lets an unverified Member shelve', async () => {
    const { user, cookies } = await member({ verified: false })
    const book = await newBook()
    expect((await shelve(book.slug, 'read', cookies)).statusCode).toBe(200)
    expect(await entriesFor(user.id)).toHaveLength(1)
  })

  it('removes a Book from the Shelf', async () => {
    const { user, cookies } = await member()
    const book = await newBook()
    await shelve(book.slug, 'read', cookies)
    const res = await unshelve(book.slug, cookies)
    expect(res.statusCode).toBe(200)
    expect(shelfResponseSchema.parse(res.json())).toEqual({ shelf: null })
    expect(await entriesFor(user.id)).toHaveLength(0)
    // Removing again is harmless.
    expect((await unshelve(book.slug, cookies)).statusCode).toBe(200)
  })

  it('returns 401 to Visitors', async () => {
    const book = await newBook()
    const res = await shelve(book.slug, 'read')
    expect(res.statusCode).toBe(401)
    expect(res.json().status).toBe(401)
  })

  it('returns 401 to Visitors on delete', async () => {
    const book = await newBook()
    expect((await unshelve(book.slug)).statusCode).toBe(401)
  })

  it('rejects an unknown Shelf with 400 and an unknown Book with 404', async () => {
    const { cookies } = await member()
    const book = await newBook()
    expect((await shelve(book.slug, 'favorites', cookies)).statusCode).toBe(400)
    expect((await shelve('no-such-book', 'read', cookies)).statusCode).toBe(404)
    expect((await unshelve('no-such-book', cookies)).statusCode).toBe(404)
  })

  it('never creates or changes a review, and reviewing never shelves', async () => {
    const { user, cookies } = await member()
    const book = await newBook()
    await shelve(book.slug, 'read', cookies)
    await shelve(book.slug, 'reading', cookies)
    await unshelve(book.slug, cookies)
    expect(
      await stack.db.db.select().from(reviews).where(eq(reviews.userId, user.id)),
    ).toHaveLength(0)

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/books/${book.slug}/my-review`,
      cookies,
      headers: { origin: ORIGIN },
      payload: {
        rating: 4,
        body: 'A thoughtful review that is comfortably longer than fifty characters.',
        hasSpoilers: false,
      },
    })
    expect(put.statusCode).toBe(201)
    expect(await entriesFor(user.id)).toHaveLength(0)

    // Shelving after reviewing leaves the review as it was.
    const [reviewBefore] = await stack.db.db
      .select()
      .from(reviews)
      .where(eq(reviews.userId, user.id))
    await shelve(book.slug, 'read', cookies)
    const [reviewAfter] = await stack.db.db
      .select()
      .from(reviews)
      .where(eq(reviews.userId, user.id))
    expect(reviewAfter).toEqual(reviewBefore)
  })
})
