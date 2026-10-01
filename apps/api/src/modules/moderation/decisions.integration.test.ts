import {
  auditLog,
  books,
  newId,
  notifications,
  reviewClaims,
  reviews,
  reviewVersions,
  users,
} from '@reprint/db'
import { problemDetailsSchema, reviewDecisionResponseSchema } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'
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
let enqueued: { name: string; payload: unknown }[]

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: {
      enqueue: async (name, payload) => {
        enqueued.push({ name, payload })
        return String(enqueued.length)
      },
    },
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
  enqueued = []
})

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function pendingReview(userId: string, rating = 4) {
  const id = newId()
  const slug = `book-${id.slice(-8)}`
  await stack.db.db.insert(books).values({ id, slug, title: 'A Book' })
  const [review] = await stack.db.db
    .insert(reviews)
    .values({ userId, bookId: id, rating, body: BODY })
    .returning()
  if (!review) throw new Error('seed failed')
  await stack.db.db
    .insert(reviewVersions)
    .values({ reviewId: review.id, version: 1, rating, body: BODY })
  return { review, bookId: id, slug }
}

const decide = (
  action: 'approve' | 'reject',
  id: string,
  cookies?: Record<string, string>,
  payload: { reason?: string } = {},
) =>
  app.inject({
    method: 'POST',
    url: `/v1/mod/reviews/${id}/${action}`,
    cookies,
    headers: { origin: ORIGIN },
    payload,
  })

describe('POST /v1/mod/reviews/:id/approve and /reject', () => {
  it('approves a Pending review, updating version, aggregates, claim, notification, and audit', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review, bookId, slug } = await pendingReview(author.user.id, 5)
    await stack.db.db.insert(reviewClaims).values({
      reviewId: review.id,
      moderatorId: mod.user.id,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const response = await decide('approve', review.id, mod.cookies)
    expect(response.statusCode).toBe(200)
    expect(reviewDecisionResponseSchema.parse(response.json())).toEqual({
      reviewId: review.id,
      status: 'approved',
    })

    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after).toMatchObject({ status: 'approved' })
    expect(after?.decidedAt).not.toBeNull()
    const [version] = await stack.db.db
      .select()
      .from(reviewVersions)
      .where(eq(reviewVersions.reviewId, review.id))
    expect(version).toMatchObject({
      status: 'approved',
      decidedBy: mod.user.id,
      decisionReason: null,
    })
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(book).toMatchObject({ reviewCount: 1, ratingSum: 5, ratingCounts: [0, 0, 0, 0, 1] })
    expect(await stack.db.db.select().from(reviewClaims)).toHaveLength(0)

    const [note] = await stack.db.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, author.user.id))
    expect(note).toMatchObject({
      type: 'review_approved',
      data: { reviewId: review.id, bookSlug: slug },
    })
    const [audit] = await stack.db.db.select().from(auditLog)
    expect(audit).toMatchObject({
      actorId: mod.user.id,
      action: 'review.approve',
      targetType: 'review',
      targetId: review.id,
      before: { status: 'pending' },
      after: { status: 'approved' },
    })
  })

  it('rejects with a reason, leaves aggregates alone, and queues the decision email', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review, bookId, slug } = await pendingReview(author.user.id)

    const response = await decide('reject', review.id, mod.cookies, { reason: 'Off topic.' })
    expect(response.statusCode).toBe(200)
    expect(reviewDecisionResponseSchema.parse(response.json()).status).toBe('rejected')

    const [version] = await stack.db.db
      .select()
      .from(reviewVersions)
      .where(eq(reviewVersions.reviewId, review.id))
    expect(version).toMatchObject({
      status: 'rejected',
      decidedBy: mod.user.id,
      decisionReason: 'Off topic.',
    })
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(book?.reviewCount).toBe(0)
    const [note] = await stack.db.db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, author.user.id), eq(notifications.type, 'review_rejected')),
      )
    expect(note?.data).toMatchObject({ reason: 'Off topic.' })
    const [audit] = await stack.db.db.select().from(auditLog)
    expect(audit).toMatchObject({ action: 'review.reject', after: { reason: 'Off topic.' } })

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]).toMatchObject({
      name: 'email.send',
      payload: {
        template: 'review-decision',
        to: author.user.email,
        props: {
          decision: 'rejected',
          reason: 'Off topic.',
          bookUrl: `${ORIGIN}/books/${slug}`,
        },
      },
    })
  })

  it('sends no email when the author turned decision emails off, but still notifies', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    await stack.db.db
      .update(users)
      .set({ emailReviewDecisions: false })
      .where(eq(users.id, author.user.id))
    const { review } = await pendingReview(author.user.id)

    expect((await decide('approve', review.id, mod.cookies)).statusCode).toBe(200)
    expect(enqueued).toHaveLength(0)
    expect(await stack.db.db.select().from(notifications)).toHaveLength(1)
  })

  it('refuses a moderator deciding their own review with 403 and changes nothing', async () => {
    const mod = await person(['moderator'])
    const { review } = await pendingReview(mod.user.id)
    const response = await decide('approve', review.id, mod.cookies)
    expect(response.statusCode).toBe(403)
    expect(problemDetailsSchema.parse(response.json()).status).toBe(403)
    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after?.status).toBe('pending')
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)
  })

  it('refuses a review claimed by another moderator with 409, but allows it once expired', async () => {
    const mod = await person(['moderator'])
    const other = await person(['moderator'])
    const author = await person()
    const { review } = await pendingReview(author.user.id)
    await stack.db.db.insert(reviewClaims).values({
      reviewId: review.id,
      moderatorId: other.user.id,
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect((await decide('reject', review.id, mod.cookies)).statusCode).toBe(409)
    const [still] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(still?.status).toBe('pending')

    await stack.db.db
      .update(reviewClaims)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(reviewClaims.reviewId, review.id))
    expect((await decide('reject', review.id, mod.cookies)).statusCode).toBe(200)
  })

  it('returns 409 for a review that was already decided and 404 for an unknown one', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review } = await pendingReview(author.user.id)
    expect((await decide('approve', review.id, mod.cookies)).statusCode).toBe(200)
    expect((await decide('reject', review.id, mod.cookies)).statusCode).toBe(409)
    expect((await decide('approve', newId(), mod.cookies)).statusCode).toBe(404)
  })

  it('rolls back the whole decision when it fails partway', async () => {
    const mod = await person(['moderator'])
    const author = await person()
    const { review, bookId } = await pendingReview(author.user.id)
    // Without a version row the decision cannot be recorded, after the review row is locked.
    await stack.db.db.delete(reviewVersions).where(eq(reviewVersions.reviewId, review.id))
    const response = await decide('approve', review.id, mod.cookies)
    expect(response.statusCode).toBe(500)
    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after?.status).toBe('pending')
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(book?.reviewCount).toBe(0)
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)
  })

  it('denies Members with 403 and Visitors with 401 on both routes', async () => {
    const member = await person()
    const author = await person()
    const { review } = await pendingReview(author.user.id)
    for (const action of ['approve', 'reject'] as const) {
      expect((await decide(action, review.id, member.cookies)).statusCode).toBe(403)
      expect((await decide(action, review.id)).statusCode).toBe(401)
    }
    const [after] = await stack.db.db.select().from(reviews).where(eq(reviews.id, review.id))
    expect(after?.status).toBe('pending')
  })
})
