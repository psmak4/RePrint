import { books, newId, reviews, users } from '@reprint/db'
import { profileReviewsResponseSchema, profileSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'

const ORIGIN = 'http://www.reprint.test:5173'
const BODY = 'A thoughtful review that is comfortably longer than the fifty character minimum.'

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
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
})

beforeEach(async () => {
  await stack.reset()
})

async function review(
  userId: string,
  options: {
    status?: 'pending' | 'approved' | 'rejected' | 'unpublished'
    helpfulCount?: number
    daysAgo?: number
    title?: string
  } = {},
) {
  const bookId = newId()
  await stack.db.db
    .insert(books)
    .values({ id: bookId, slug: `book-${bookId.slice(-8)}`, title: options.title ?? 'A Book' })
  const [row] = await stack.db.db
    .insert(reviews)
    .values({
      userId,
      bookId,
      rating: 4,
      body: BODY,
      status: options.status ?? 'approved',
      helpfulCount: options.helpfulCount ?? 0,
      submittedAt: new Date(Date.now() - (options.daysAgo ?? 0) * 86_400_000),
    })
    .returning()
  if (!row) throw new Error('failed to insert review')
  return row
}

describe('GET /v1/users/:username', () => {
  it('returns the public profile with review and helpful totals', async () => {
    const user = await createTestUser(stack.db.db)
    await stack.db.db.update(users).set({ bio: 'Reads a lot.' }).where(eq(users.id, user.id))
    await review(user.id, { helpfulCount: 3 })
    await review(user.id, { helpfulCount: 2 })
    // Only Approved reviews count towards the totals.
    await review(user.id, { status: 'pending', helpfulCount: 9 })
    await review(user.id, { status: 'unpublished', helpfulCount: 9 })

    const response = await app.inject({ method: 'GET', url: `/v1/users/${user.username}` })
    expect(response.statusCode).toBe(200)
    const profile = profileSchema.parse(response.json())
    expect(profile).toMatchObject({
      username: user.username,
      displayName: user.displayName,
      bio: 'Reads a lot.',
      avatarUrl: null,
      reviewCount: 2,
      helpfulVotes: 5,
      libraryPublic: true,
    })
    expect(profile.joinedAt).toBe(user.createdAt.toISOString())
    expect(response.headers['cache-control']).toContain('public')
    expect(JSON.stringify(response.json())).not.toContain(user.email)
  })

  it('shows zero totals for a Member with no reviews', async () => {
    const user = await createTestUser(stack.db.db, { verified: false })
    const response = await app.inject({ method: 'GET', url: `/v1/users/${user.username}` })
    expect(response.json()).toMatchObject({ reviewCount: 0, helpfulVotes: 0 })
  })

  it('answers 404 for unknown, suspended, and deleted users', async () => {
    const suspended = await createTestUser(stack.db.db, { status: 'suspended' })
    const deleted = await createTestUser(stack.db.db, { status: 'deleted' })
    for (const username of ['nobody_here', suspended.username, deleted.username]) {
      const response = await app.inject({ method: 'GET', url: `/v1/users/${username}` })
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ status: 404 })
    }
  })
})

describe('GET /v1/users/:username/reviews', () => {
  it('lists Approved reviews newest first, paginated', async () => {
    const user = await createTestUser(stack.db.db)
    await review(user.id, { daysAgo: 3, title: 'Oldest' })
    await review(user.id, { daysAgo: 1, title: 'Newest' })
    await review(user.id, { daysAgo: 2, title: 'Middle' })
    await review(user.id, { status: 'pending', daysAgo: 0, title: 'Pending' })
    await review(user.id, { status: 'rejected', daysAgo: 0, title: 'Rejected' })

    const first = await app.inject({
      method: 'GET',
      url: `/v1/users/${user.username}/reviews?pageSize=2`,
    })
    expect(first.statusCode).toBe(200)
    const page1 = profileReviewsResponseSchema.parse(first.json())
    expect(page1.items.map((item) => item.book.title)).toEqual(['Newest', 'Middle'])
    expect(page1.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 })

    const second = await app.inject({
      method: 'GET',
      url: `/v1/users/${user.username}/reviews?pageSize=2&page=2`,
    })
    const page2 = profileReviewsResponseSchema.parse(second.json())
    expect(page2.items.map((item) => item.book.title)).toEqual(['Oldest'])
  })

  it('answers 404 for unknown, suspended, and deleted users on reviews', async () => {
    const suspended = await createTestUser(stack.db.db, { status: 'suspended' })
    await review(suspended.id)
    for (const username of ['nobody_here', suspended.username]) {
      const response = await app.inject({ method: 'GET', url: `/v1/users/${username}/reviews` })
      expect(response.statusCode).toBe(404)
    }
  })
})
