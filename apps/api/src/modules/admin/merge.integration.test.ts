import {
  auditLog,
  bookSlugRedirects,
  books,
  editions,
  mergeCandidates,
  newId,
  reviews,
  reviewVersions,
  shelfEntries,
  sourceLinks,
} from '@reprint/db'
import {
  adminBookMergeResponseSchema,
  adminMergeCandidatesResponseSchema,
  type BookCandidate,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const BODY = 'A review body that is comfortably longer than fifty characters, for the schema.'
const stub = createStubSource()

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

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function ingest(sourceId: string) {
  const found: BookCandidate | null = await stub.getBook(sourceId)
  if (!found) throw new Error(`stub has no ${sourceId}`)
  const result = await ingestBook(stack.db.db, { source: stub, candidate: found })
  const [row] = await stack.db.db.select().from(books).where(eq(books.id, result.bookId))
  if (!row) throw new Error('ingest failed')
  return row
}

/** Two Books to merge; `from` is removed. */
async function pair() {
  return { from: await ingest('stub-book-hobbit'), into: await ingest('stub-book-dune') }
}

async function plainBook() {
  const id = newId()
  const [row] = await stack.db.db
    .insert(books)
    .values({ id, slug: `plain-book-${id.slice(-6)}`, title: 'Plain Book' })
    .returning()
  if (!row) throw new Error('seed failed')
  return row
}

async function review(userId: string, bookId: string, rating: number, status = 'approved') {
  const [row] = await stack.db.db
    .insert(reviews)
    .values({ userId, bookId, rating, body: BODY, status: status as 'approved' })
    .returning()
  if (!row) throw new Error('seed failed')
  await stack.db.db
    .insert(reviewVersions)
    .values({ reviewId: row.id, version: 1, rating, body: BODY, status: status as 'approved' })
  if (status === 'approved') {
    const [book] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    if (!book) throw new Error('no book')
    const counts = [...book.ratingCounts]
    counts[rating - 1] = (counts[rating - 1] ?? 0) + 1
    await stack.db.db
      .update(books)
      .set({
        reviewCount: book.reviewCount + 1,
        ratingSum: book.ratingSum + rating,
        ratingCounts: counts,
      })
      .where(eq(books.id, bookId))
  }
  return row
}

const merge = (payload: object, cookies?: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: '/v1/admin/books/merge',
    cookies,
    payload,
    headers: { origin: ORIGIN },
  })

describe('GET /v1/admin/books/merge-candidates', () => {
  it('lists open merge candidates oldest first with both Books', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    const [dismissed] = await stack.db.db
      .insert(mergeCandidates)
      .values({ bookAId: into.id, bookBId: from.id, reason: 'same_title_and_author' })
      .returning()
    await stack.db.db
      .insert(mergeCandidates)
      .values({ bookAId: from.id, bookBId: into.id, reason: 'same_title_and_author' })
    await stack.db.db
      .update(mergeCandidates)
      .set({ status: 'dismissed' })
      .where(eq(mergeCandidates.id, dismissed?.id ?? ''))
    const member = await person()
    await review(member.user.id, into.id, 5)

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/books/merge-candidates',
      cookies: admin.cookies,
    })
    expect(response.statusCode).toBe(200)
    const body = adminMergeCandidatesResponseSchema.parse(response.json())
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      reason: 'same_title_and_author',
      bookA: { id: from.id },
      bookB: { id: into.id, reviewCount: 1 },
    })
    expect(body.items[0]?.bookB.authors).toContain('Frank Herbert')
    expect(body.meta.nextCursor).toBeNull()
  })

  it('pages with a cursor', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    await stack.db.db.insert(mergeCandidates).values([
      { bookAId: from.id, bookBId: into.id, reason: 'a' },
      { bookAId: into.id, bookBId: from.id, reason: 'b' },
    ])
    const first = await app.inject({
      method: 'GET',
      url: '/v1/admin/books/merge-candidates?limit=1',
      cookies: admin.cookies,
    })
    const page1 = adminMergeCandidatesResponseSchema.parse(first.json())
    expect(page1.items).toHaveLength(1)
    expect(page1.meta.nextCursor).not.toBeNull()
    const second = await app.inject({
      method: 'GET',
      url: `/v1/admin/books/merge-candidates?limit=1&cursor=${page1.meta.nextCursor}`,
      cookies: admin.cookies,
    })
    const page2 = adminMergeCandidatesResponseSchema.parse(second.json())
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id)
    expect(page2.meta.nextCursor).toBeNull()
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const moderator = await person(['moderator'])
    const member = await person()
    const url = '/v1/admin/books/merge-candidates'
    expect((await app.inject({ method: 'GET', url, cookies: moderator.cookies })).statusCode).toBe(
      403,
    )
    expect((await app.inject({ method: 'GET', url, cookies: member.cookies })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
  })
})

describe('POST /v1/admin/books/merge-candidates/:id/dismiss', () => {
  const dismiss = (id: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: `/v1/admin/books/merge-candidates/${id}/dismiss`,
      cookies,
      headers: { origin: ORIGIN },
    })

  it('dismisses a candidate and audits it', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    const [candidate] = await stack.db.db
      .insert(mergeCandidates)
      .values({ bookAId: from.id, bookBId: into.id, reason: 'same_title_and_author' })
      .returning()
    const response = await dismiss(candidate?.id ?? '', admin.cookies)
    expect(response.statusCode).toBe(200)
    const [row] = await stack.db.db.select().from(mergeCandidates)
    expect(row?.status).toBe('dismissed')
    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({
      action: 'merge.dismiss',
      targetType: 'merge_candidate',
      targetId: candidate?.id,
      actorId: admin.user.id,
    })
    expect((await dismiss(candidate?.id ?? '', admin.cookies)).statusCode).toBe(409)
    expect((await dismiss('019a0000-0000-7000-8000-000000000000', admin.cookies)).statusCode).toBe(
      404,
    )
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const id = '019a0000-0000-7000-8000-000000000000'
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await dismiss(id, moderator.cookies)).statusCode).toBe(403)
    expect((await dismiss(id, member.cookies)).statusCode).toBe(403)
    expect((await dismiss(id)).statusCode).toBe(401)
  })
})

describe('POST /v1/admin/books/merge', () => {
  it('merges Books, moves their data, and audits the merge', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    const alice = await person()
    const bob = await person()
    const carol = await person()
    await review(alice.user.id, from.id, 5)
    await review(bob.user.id, into.id, 3)
    await review(carol.user.id, from.id, 1, 'pending')
    // Alice shelves both Books; Bob shelves only the one that goes away.
    await stack.db.db.insert(shelfEntries).values([
      { userId: alice.user.id, bookId: from.id, shelf: 'read' },
      { userId: alice.user.id, bookId: into.id, shelf: 'reading' },
      { userId: bob.user.id, bookId: from.id, shelf: 'want_to_read' },
    ])
    const fromEditions = await stack.db.db
      .select({ id: editions.id })
      .from(editions)
      .where(eq(editions.bookId, from.id))
    await stack.db.db.insert(mergeCandidates).values({
      bookAId: from.id,
      bookBId: into.id,
      reason: 'same_title_and_author',
    })

    const response = await merge({ fromBookId: from.id, intoBookId: into.id }, admin.cookies)
    expect(response.statusCode).toBe(200)
    const body = adminBookMergeResponseSchema.parse(response.json())
    expect(body.book.id).toBe(into.id)
    expect(body.moved).toEqual({
      reviews: 2,
      shelfEntries: 1,
      editions: fromEditions.length,
    })

    expect(await stack.db.db.select().from(books).where(eq(books.id, from.id))).toHaveLength(0)
    const moved = await stack.db.db.select().from(reviews).where(eq(reviews.bookId, into.id))
    expect(moved).toHaveLength(3)
    const entries = await stack.db.db.select().from(shelfEntries)
    expect(entries.map((e) => [e.userId, e.shelf]).sort()).toEqual(
      [
        [alice.user.id, 'reading'],
        [bob.user.id, 'want_to_read'],
      ].sort(),
    )
    for (const edition of fromEditions) {
      const [row] = await stack.db.db.select().from(editions).where(eq(editions.id, edition.id))
      expect(row?.bookId).toBe(into.id)
    }
    const links = await stack.db.db
      .select()
      .from(sourceLinks)
      .where(eq(sourceLinks.entityId, from.id))
    expect(links).toHaveLength(0)
    const [bookLink] = await stack.db.db
      .select()
      .from(sourceLinks)
      .where(eq(sourceLinks.sourceId, 'stub-book-hobbit'))
    expect(bookLink?.entityId).toBe(into.id)

    // Aggregates count Approved reviews only: Alice's 5 and Bob's 3.
    const [after] = await stack.db.db.select().from(books).where(eq(books.id, into.id))
    expect(after).toMatchObject({ reviewCount: 2, ratingSum: 8, ratingCounts: [0, 0, 1, 0, 1] })

    const [redirect] = await stack.db.db.select().from(bookSlugRedirects)
    expect(redirect).toMatchObject({ slug: from.slug, bookId: into.id })
    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({
      action: 'book.merge',
      targetType: 'book',
      targetId: into.id,
      actorId: admin.user.id,
    })
    expect(entry?.before).toMatchObject({ mergedBook: { id: from.id, slug: from.slug } })
    expect(await stack.db.db.select().from(mergeCandidates)).toHaveLength(0)

    // The old slug now answers with the remaining Book.
    const old = await app.inject({ method: 'GET', url: `/v1/books/${from.slug}` })
    expect(old.statusCode).toBe(200)
    expect(old.json().slug).toBe(into.slug)
  })

  it('fails with 409 when a Member reviewed both Books and changes nothing', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    const member = await person()
    await review(member.user.id, from.id, 4)
    await review(member.user.id, into.id, 2, 'pending')
    const response = await merge({ fromBookId: from.id, intoBookId: into.id }, admin.cookies)
    expect(response.statusCode).toBe(409)
    expect(response.json().type).toBeDefined()
    expect(await stack.db.db.select().from(books).where(eq(books.id, from.id))).toHaveLength(1)
    expect(await stack.db.db.select().from(reviews)).toHaveLength(2)
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)
  })

  it('keeps earlier redirects working across a second merge', async () => {
    const { from, into } = await pair()
    const admin = await person(['admin'])
    expect(
      (await merge({ fromBookId: from.id, intoBookId: into.id }, admin.cookies)).statusCode,
    ).toBe(200)
    const third = await plainBook()
    expect(
      (await merge({ fromBookId: into.id, intoBookId: third.id }, admin.cookies)).statusCode,
    ).toBe(200)
    for (const slug of [from.slug, into.slug]) {
      const response = await app.inject({ method: 'GET', url: `/v1/books/${slug}` })
      expect(response.json().slug).toBe(third.slug)
    }
  })

  it('rejects the same Book twice and unknown Books', async () => {
    const { from } = await pair()
    const admin = await person(['admin'])
    expect(
      (await merge({ fromBookId: from.id, intoBookId: from.id }, admin.cookies)).statusCode,
    ).toBe(400)
    const unknown = '019a0000-0000-7000-8000-000000000000'
    expect(
      (await merge({ fromBookId: from.id, intoBookId: unknown }, admin.cookies)).statusCode,
    ).toBe(404)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const { from, into } = await pair()
    const payload = { fromBookId: from.id, intoBookId: into.id }
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await merge(payload, moderator.cookies)).statusCode).toBe(403)
    expect((await merge(payload, member.cookies)).statusCode).toBe(403)
    expect((await merge(payload)).statusCode).toBe(401)
    expect(await stack.db.db.select().from(books).where(eq(books.id, from.id))).toHaveLength(1)
  })
})
