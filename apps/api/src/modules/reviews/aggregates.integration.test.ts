import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { books, newId, reviews, users } from '@reprint/db'
import { ACCOUNT_ERASE_AFTER_DAYS, type ReviewStatus } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import { pino } from 'pino'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { jobs } from '../../jobs/registry.js'
import { LocalImageStorage } from '../../storage/index.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { eraseDeletedAccounts } from '../accounts/erase.js'
import { applyReviewChange, recomputeRatings, removeMemberFromAggregates } from './aggregates.js'

const BODY = 'x'.repeat(60)
const DAY_MS = 24 * 60 * 60 * 1000
const log = pino({ level: 'silent' })

let stack: TestStack
let storageDir: string

beforeAll(async () => {
  stack = await startTestStack()
  storageDir = await mkdtemp(join(tmpdir(), 'reprint-ratings-'))
})

afterAll(async () => {
  await stack?.stop()
  await rm(storageDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await stack.reset()
})

async function newBook() {
  const id = newId()
  await stack.db.db.insert(books).values({ id, slug: `book-${id.slice(-8)}`, title: 'A Book' })
  return id
}

async function totals(bookId: string) {
  const [row] = await stack.db.db
    .select({
      reviewCount: books.reviewCount,
      ratingSum: books.ratingSum,
      ratingCounts: books.ratingCounts,
    })
    .from(books)
    .where(eq(books.id, bookId))
  return row
}

/** Inserts a review and updates the aggregates the way an endpoint does: in one transaction. */
async function addReview(bookId: string, userId: string, rating: number, status: ReviewStatus) {
  return stack.db.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(reviews)
      .values({ userId, bookId, rating, body: BODY, status })
      .returning()
    if (!row) throw new Error('insert failed')
    await applyReviewChange(tx, bookId, null, { status, rating })
    return row
  })
}

describe('applyReviewChange', () => {
  it('counts a review only while it is Approved', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    await addReview(bookId, user.id, 4, 'pending')
    expect(await totals(bookId)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })

    await stack.db.db.transaction((tx) =>
      applyReviewChange(
        tx,
        bookId,
        { status: 'pending', rating: 4 },
        { status: 'approved', rating: 4 },
      ),
    )
    expect(await totals(bookId)).toEqual({
      reviewCount: 1,
      ratingSum: 4,
      ratingCounts: [0, 0, 0, 1, 0],
    })
  })

  it('takes an edited Approved review out until it is approved again, at its new rating', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    const other = await createTestUser(stack.db.db)
    await addReview(bookId, other.id, 2, 'approved')
    await addReview(bookId, user.id, 5, 'approved')
    expect(await totals(bookId)).toEqual({
      reviewCount: 2,
      ratingSum: 7,
      ratingCounts: [0, 1, 0, 0, 1],
    })

    // Edit to 3 stars: back to Pending, so the 5 leaves the totals.
    await stack.db.db.transaction((tx) =>
      applyReviewChange(
        tx,
        bookId,
        { status: 'approved', rating: 5 },
        { status: 'pending', rating: 3 },
      ),
    )
    expect(await totals(bookId)).toEqual({
      reviewCount: 1,
      ratingSum: 2,
      ratingCounts: [0, 1, 0, 0, 0],
    })

    await stack.db.db.transaction((tx) =>
      applyReviewChange(
        tx,
        bookId,
        { status: 'pending', rating: 3 },
        { status: 'approved', rating: 3 },
      ),
    )
    expect(await totals(bookId)).toEqual({
      reviewCount: 2,
      ratingSum: 5,
      ratingCounts: [0, 1, 1, 0, 0],
    })
  })

  it('handles unpublishing and deleting an Approved review', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    await addReview(bookId, user.id, 1, 'approved')
    await stack.db.db.transaction((tx) =>
      applyReviewChange(
        tx,
        bookId,
        { status: 'approved', rating: 1 },
        { status: 'unpublished', rating: 1 },
      ),
    )
    expect(await totals(bookId)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })

    await stack.db.db.transaction((tx) =>
      applyReviewChange(tx, bookId, { status: 'rejected', rating: 1 }, null),
    )
    expect(await totals(bookId)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })
  })

  it('rolls the totals back with the review when the transaction fails', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    await expect(
      stack.db.db.transaction(async (tx) => {
        await tx
          .insert(reviews)
          .values({ userId: user.id, bookId, rating: 5, body: BODY, status: 'approved' })
        await applyReviewChange(tx, bookId, null, { status: 'approved', rating: 5 })
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await totals(bookId)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })
  })
})

describe('ratings.recompute', () => {
  it('finds nothing to fix when the aggregates are right', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    await addReview(bookId, user.id, 4, 'approved')
    const result = await recomputeRatings({ db: stack.db.db, log })
    expect(result.mismatches).toEqual([])
    expect(result.checked).toBe(1)
  })

  it('reports and fixes deliberately corrupted aggregates', async () => {
    const good = await newBook()
    const wrong = await newBook()
    const phantom = await newBook()
    const a = await createTestUser(stack.db.db)
    const b = await createTestUser(stack.db.db)
    await addReview(good, a.id, 5, 'approved')
    await addReview(wrong, a.id, 3, 'approved')
    await addReview(wrong, b.id, 4, 'pending')
    await stack.db.db
      .update(books)
      .set({ reviewCount: 9, ratingSum: 40, ratingCounts: [0, 0, 0, 0, 9] })
      .where(eq(books.id, wrong))
    await stack.db.db
      .update(books)
      .set({ reviewCount: 1, ratingSum: 2, ratingCounts: [0, 1, 0, 0, 0] })
      .where(eq(books.id, phantom))

    const result = await recomputeRatings({ db: stack.db.db, log })
    expect(result.mismatches.map((m) => m.bookId).sort()).toEqual([wrong, phantom].sort())
    expect(await totals(wrong)).toEqual({
      reviewCount: 1,
      ratingSum: 3,
      ratingCounts: [0, 0, 1, 0, 0],
    })
    expect(await totals(phantom)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })
    expect(await totals(good)).toEqual({
      reviewCount: 1,
      ratingSum: 5,
      ratingCounts: [0, 0, 0, 0, 1],
    })

    // A second run is clean.
    expect((await recomputeRatings({ db: stack.db.db, log })).mismatches).toEqual([])
  })

  it('ignores reviews by deleted accounts', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db, { status: 'deleted' })
    await addReview(bookId, user.id, 5, 'approved')
    const result = await recomputeRatings({ db: stack.db.db, log })
    expect(result.mismatches).toHaveLength(1)
    expect(await totals(bookId)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })
  })

  it('runs as the registered job and is scheduled daily', async () => {
    const bookId = await newBook()
    const user = await createTestUser(stack.db.db)
    await addReview(bookId, user.id, 2, 'approved')
    await stack.db.db.update(books).set({ reviewCount: 3 }).where(eq(books.id, bookId))
    const result = await jobs['ratings.recompute'].handler(
      {},
      // The handler only uses `db` and `log`.
      { db: stack.db.db, log } as never,
    )
    expect(result).toEqual({ checked: 1, mismatches: 1 })
    expect(jobs['ratings.recompute'].schedule?.everyMs).toBe(DAY_MS)
  })
})

describe('account deletion and erase', () => {
  it('drops a Member’s Approved reviews from aggregates at deletion, and erase leaves them right', async () => {
    const one = await newBook()
    const two = await newBook()
    const leaver = await createTestUser(stack.db.db)
    const stayer = await createTestUser(stack.db.db)
    await addReview(one, leaver.id, 5, 'approved')
    await addReview(two, leaver.id, 1, 'pending')
    await addReview(one, stayer.id, 3, 'approved')

    await stack.db.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: 'deleted',
          deletedAt: new Date(Date.now() - (ACCOUNT_ERASE_AFTER_DAYS + 1) * DAY_MS),
        })
        .where(eq(users.id, leaver.id))
      await removeMemberFromAggregates(tx, leaver.id)
    })
    expect(await totals(one)).toEqual({
      reviewCount: 1,
      ratingSum: 3,
      ratingCounts: [0, 0, 1, 0, 0],
    })
    expect(await totals(two)).toEqual({
      reviewCount: 0,
      ratingSum: 0,
      ratingCounts: [0, 0, 0, 0, 0],
    })

    const storage = new LocalImageStorage(storageDir, 'http://localhost/uploads')
    const erased = await eraseDeletedAccounts({ db: stack.db.db, storage, log })
    expect(erased.erased).toBe(1)
    expect(await stack.db.db.select().from(reviews).where(eq(reviews.userId, leaver.id))).toEqual(
      [],
    )
    expect(await totals(one)).toEqual({
      reviewCount: 1,
      ratingSum: 3,
      ratingCounts: [0, 0, 1, 0, 0],
    })
    expect((await recomputeRatings({ db: stack.db.db, log })).mismatches).toEqual([])
  })
})
