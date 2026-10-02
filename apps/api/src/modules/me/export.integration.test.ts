import {
  books,
  helpfulVotes,
  newId,
  notifications,
  reviewReports,
  reviews,
  reviewVersions,
  shelfEntries,
} from '@reprint/db'
import { memberExportSchema, problemDetailsSchema } from '@reprint/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const BODY = 'A review body that is comfortably longer than the fifty character minimum.'

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

async function member() {
  const user = await createTestUser(stack.db.db)
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function newBook(title: string) {
  const id = newId()
  await stack.db.db.insert(books).values({ id, slug: `book-${id.slice(-8)}`, title })
  return { id, title }
}

async function review(userId: string, bookId: string, status: 'approved' | 'pending' = 'approved') {
  const id = newId()
  await stack.db.db
    .insert(reviews)
    .values({ id, userId, bookId, rating: 4, headline: 'Good', body: BODY, status })
  await stack.db.db
    .insert(reviewVersions)
    .values({ reviewId: id, version: 1, rating: 4, headline: 'Good', body: BODY, status })
  return id
}

describe('GET /v1/me/export', () => {
  it('downloads the Member’s own data as JSON, and nobody else’s', async () => {
    const me = await member()
    const other = await createTestUser(stack.db.db)
    const read = await newBook('Read By Me')
    const shared = await newBook('Shelved By Both')
    const myReview = await review(me.user.id, read.id)
    const otherReview = await review(other.id, read.id)
    await review(other.id, shared.id)
    await stack.db.db.insert(shelfEntries).values([
      { userId: me.user.id, bookId: read.id, shelf: 'read' },
      { userId: other.id, bookId: shared.id, shelf: 'reading' },
    ])
    await stack.db.db.insert(helpfulVotes).values([
      { reviewId: otherReview, userId: me.user.id },
      { reviewId: myReview, userId: other.id },
    ])
    await stack.db.db.insert(reviewReports).values([
      { reviewId: otherReview, reporterId: me.user.id, reason: 'spam' },
      { reviewId: myReview, reporterId: other.id, reason: 'offensive' },
    ])
    await stack.db.db.insert(notifications).values([
      { userId: me.user.id, type: 'review_approved', data: { bookTitle: 'Read By Me' } },
      { userId: other.id, type: 'password_changed' },
    ])

    const response = await app.inject({ method: 'GET', url: '/v1/me/export', cookies: me.cookies })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toContain('attachment')
    expect(response.headers['cache-control']).toBe('no-store')
    const data = memberExportSchema.parse(response.json())

    expect(data.account).toMatchObject({ id: me.user.id, email: me.user.email })
    expect(data.profile.displayName).toBe(me.user.displayName)
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0]).toMatchObject({ id: myReview, status: 'approved' })
    expect(data.reviews[0]?.versions).toHaveLength(1)
    expect(data.helpfulVotes.map((vote) => vote.reviewId)).toEqual([otherReview])
    expect(data.reports).toHaveLength(1)
    expect(data.reports[0]).toMatchObject({ reviewId: otherReview, reason: 'spam', status: 'open' })
    expect(data.library).toHaveLength(1)
    expect(data.library[0]).toMatchObject({ shelf: 'read', book: { title: 'Read By Me' } })
    expect(data.notifications.map((n) => n.type)).toEqual(['review_approved'])
    expect(data.sessions).toHaveLength(1)

    const text = response.body
    expect(text).not.toContain(other.id)
    expect(text).not.toContain(other.email)
    expect(text).not.toContain('Shelved By Both')
    expect(text).not.toMatch(/token|password|hash/i)
  })

  it('includes a Pending review that is not public yet', async () => {
    const me = await member()
    const book = await newBook('Waiting')
    await review(me.user.id, book.id, 'pending')
    const response = await app.inject({ method: 'GET', url: '/v1/me/export', cookies: me.cookies })
    const data = memberExportSchema.parse(response.json())
    expect(data.reviews[0]?.status).toBe('pending')
  })

  it('returns an empty export for a Member with no activity', async () => {
    const me = await member()
    const response = await app.inject({ method: 'GET', url: '/v1/me/export', cookies: me.cookies })
    const data = memberExportSchema.parse(response.json())
    expect(data.reviews).toEqual([])
    expect(data.library).toEqual([])
    expect(data.helpfulVotes).toEqual([])
    expect(data.reports).toEqual([])
  })

  it('returns 401 Problem Details for a Visitor', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/export' })
    expect(response.statusCode).toBe(401)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(401)
  })
})
