import { books, helpfulVotes, newId, reviews } from '@reprint/db'
import {
  helpfulVoteResponseSchema,
  myHelpfulVotesResponseSchema,
  type ReviewStatus,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const BODY = 'A thoughtful review that is comfortably longer than fifty characters.'

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

async function newReview(status: ReviewStatus = 'approved', authorStatus?: 'deleted') {
  const author = await createTestUser(stack.db.db, authorStatus ? { status: authorStatus } : {})
  const bookId = newId()
  await stack.db.db
    .insert(books)
    .values({ id: bookId, slug: `book-${bookId.slice(-8)}`, title: 'A Book' })
  const [review] = await stack.db.db
    .insert(reviews)
    .values({ userId: author.id, bookId, rating: 5, body: BODY, status })
    .returning()
  if (!review) throw new Error('review not inserted')
  return { author, review }
}

function vote(method: 'POST' | 'DELETE', id: string, cookies?: Record<string, string>) {
  return app.inject({
    method,
    url: `/v1/reviews/${id}/helpful`,
    cookies,
    headers: { origin: ORIGIN },
  })
}

async function count(id: string) {
  const [row] = await stack.db.db
    .select({ n: reviews.helpfulCount })
    .from(reviews)
    .where(eq(reviews.id, id))
  return row?.n
}

describe('POST /v1/reviews/:id/helpful', () => {
  it('lets a verified Member vote once on an Approved review', async () => {
    const { review } = await newReview()
    const first = await member()
    const second = await member()

    const response = await vote('POST', review.id, first.cookies)
    expect(response.statusCode).toBe(200)
    expect(helpfulVoteResponseSchema.parse(response.json())).toEqual({
      helpful: true,
      helpfulCount: 1,
    })
    // Voting again is a no-op: one vote per Member.
    const again = await vote('POST', review.id, first.cookies)
    expect(helpfulVoteResponseSchema.parse(again.json())).toEqual({
      helpful: true,
      helpfulCount: 1,
    })
    const other = await vote('POST', review.id, second.cookies)
    expect(helpfulVoteResponseSchema.parse(other.json()).helpfulCount).toBe(2)

    expect(await count(review.id)).toBe(2)
    expect(await stack.db.db.select().from(helpfulVotes)).toHaveLength(2)
  })

  it('denies Visitors, unverified Members, the author, and non-Approved reviews', async () => {
    const { author, review } = await newReview()
    expect((await vote('POST', review.id)).statusCode).toBe(401)
    const unverified = await member({ verified: false })
    expect((await vote('POST', review.id, unverified.cookies)).statusCode).toBe(403)

    const authorCookies = (await app.inject({ method: 'GET', url: `/test/start/${author.id}` }))
      .cookies
    const own = await vote('POST', review.id, {
      [SESSION_COOKIE]: authorCookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
    })
    expect(own.statusCode).toBe(403)

    const voter = await member()
    for (const status of ['pending', 'rejected', 'unpublished'] as const) {
      const hidden = await newReview(status)
      expect((await vote('POST', hidden.review.id, voter.cookies)).statusCode).toBe(404)
    }
    const erased = await newReview('approved', 'deleted')
    expect((await vote('POST', erased.review.id, voter.cookies)).statusCode).toBe(404)
    expect((await vote('POST', newId(), voter.cookies)).statusCode).toBe(404)

    expect(await count(review.id)).toBe(0)
    expect(await stack.db.db.select().from(helpfulVotes)).toHaveLength(0)
  })
})

describe('DELETE /v1/reviews/:id/helpful', () => {
  it('removes the vote and lowers the count', async () => {
    const { review } = await newReview()
    const voter = await member()
    await vote('POST', review.id, voter.cookies)

    const response = await vote('DELETE', review.id, voter.cookies)
    expect(response.statusCode).toBe(200)
    expect(helpfulVoteResponseSchema.parse(response.json())).toEqual({
      helpful: false,
      helpfulCount: 0,
    })
    // Removing again changes nothing, and never goes below zero.
    const again = await vote('DELETE', review.id, voter.cookies)
    expect(helpfulVoteResponseSchema.parse(again.json()).helpfulCount).toBe(0)
    expect(await stack.db.db.select().from(helpfulVotes)).toHaveLength(0)
  })

  it('still removes a vote after the review leaves Approved', async () => {
    const { review } = await newReview()
    const voter = await member()
    await vote('POST', review.id, voter.cookies)
    await stack.db.db
      .update(reviews)
      .set({ status: 'unpublished' })
      .where(eq(reviews.id, review.id))

    const response = await vote('DELETE', review.id, voter.cookies)
    expect(response.statusCode).toBe(200)
    expect(await count(review.id)).toBe(0)
  })

  it('denies Visitors and answers 404 for an unknown review', async () => {
    const { review } = await newReview()
    expect((await vote('DELETE', review.id)).statusCode).toBe(401)
    const voter = await member()
    expect((await vote('DELETE', newId(), voter.cookies)).statusCode).toBe(404)
  })
})

describe('GET /v1/books/:slug/helpful-votes', () => {
  it('lists the review IDs the Member marked helpful on a Book', async () => {
    const { review } = await newReview()
    const other = await newReview()
    const voter = await member()
    await vote('POST', review.id, voter.cookies)
    await vote('POST', other.review.id, voter.cookies)
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, review.bookId))

    const response = await app.inject({
      method: 'GET',
      url: `/v1/books/${book?.slug}/helpful-votes`,
      cookies: voter.cookies,
    })
    expect(response.statusCode).toBe(200)
    expect(myHelpfulVotesResponseSchema.parse(response.json()).reviewIds).toEqual([review.id])
  })

  it('denies Visitors and answers 404 for an unknown Book', async () => {
    const voter = await member()
    const visitor = await app.inject({ method: 'GET', url: '/v1/books/some-book/helpful-votes' })
    expect(visitor.statusCode).toBe(401)
    const unknown = await app.inject({
      method: 'GET',
      url: '/v1/books/no-such-book/helpful-votes',
      cookies: voter.cookies,
    })
    expect(unknown.statusCode).toBe(404)
  })
})
