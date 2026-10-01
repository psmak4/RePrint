import { books, type Database } from '@reprint/db'
import type { ReviewStatus } from '@reprint/shared'
import { eq, sql } from 'drizzle-orm'
import type { Logger } from 'pino'
import { captureError } from '../../observability/sentry.js'

/** A database or an open transaction, so callers update aggregates inside their own transaction. */
type Executor = Pick<Database, 'update' | 'execute'>

/** How a Review looks to the aggregates: only Approved reviews count (PRD §7.6). */
export interface ReviewAggregateState {
  status: ReviewStatus
  rating: number
}

/**
 * Keeps a Book's cached `review_count`, `rating_sum`, and `rating_counts` in step with one Review
 * changing (PRD §9). `before` is the Review as it was (`null` when it did not exist) and `after`
 * as it is now (`null` when it was deleted). Call it inside the transaction that changes the
 * Review, so the Review and the totals commit together. A Review counts only while Approved, so
 * an edit that sends an Approved review back to Pending takes its old rating out.
 */
export async function applyReviewChange(
  executor: Executor,
  bookId: string,
  before: ReviewAggregateState | null,
  after: ReviewAggregateState | null,
): Promise<void> {
  if (before?.status === 'approved') await adjust(executor, bookId, before.rating, -1)
  if (after?.status === 'approved') await adjust(executor, bookId, after.rating, 1)
}

async function adjust(executor: Executor, bookId: string, rating: number, delta: 1 | -1) {
  await executor
    .update(books)
    .set({
      reviewCount: sql`${books.reviewCount} + ${delta}`,
      ratingSum: sql`${books.ratingSum} + ${delta * rating}`,
      // `rating_counts[rating]` is the 1-based bucket for that many stars.
      ratingCounts: sql`(
        select array_agg(case when t.i = ${rating} then t.c + ${delta} else t.c end order by t.i)
        from unnest(${books.ratingCounts}) with ordinality as t(c, i)
      )`,
    })
    .where(eq(books.id, bookId))
}

/**
 * Takes every Approved review by a Member out of the Books' aggregates. Deleting an account does
 * this immediately (D-043), in the deletion's transaction; the later `accounts.erase` removes the
 * rows without touching aggregates again (D-116).
 */
export async function removeMemberFromAggregates(
  executor: Executor,
  userId: string,
): Promise<void> {
  const rows = await executor.execute<{ book_id: string; rating: number }>(sql`
    select book_id, rating from reviews where user_id = ${userId} and status = 'approved'`)
  for (const row of rows) await adjust(executor, row.book_id, row.rating, -1)
}

export interface RatingMismatch {
  bookId: string
  stored: { reviewCount: number; ratingSum: number; ratingCounts: number[] }
  expected: { reviewCount: number; ratingSum: number; ratingCounts: number[] }
}

interface MismatchRow extends Record<string, unknown> {
  book_id: string
  stored_count: number
  stored_sum: number
  stored_counts: number[]
  expected_count: number
  expected_sum: number
  expected_counts: number[]
}

/**
 * Recalculates every Book's aggregates from Approved reviews of Members whose account is not
 * deleted, and corrects any Book that differs (PRD §9). Mismatches are logged and sent to Sentry,
 * because they mean some code path changed a review without updating the totals.
 */
export async function recomputeRatings(options: {
  db: Database
  log: Logger
}): Promise<{ checked: number; mismatches: RatingMismatch[] }> {
  const { db, log } = options
  return db.transaction(async (tx) => {
    const rows = await tx.execute<MismatchRow>(sql`
      with expected as (
        select r.book_id,
          count(*)::int as review_count,
          sum(r.rating)::int as rating_sum,
          array[
            count(*) filter (where r.rating = 1)::int,
            count(*) filter (where r.rating = 2)::int,
            count(*) filter (where r.rating = 3)::int,
            count(*) filter (where r.rating = 4)::int,
            count(*) filter (where r.rating = 5)::int
          ] as rating_counts
        from reviews r
        join users u on u.id = r.user_id
        where r.status = 'approved' and u.status <> 'deleted'
        group by r.book_id
      )
      select b.id as book_id,
        b.review_count as stored_count,
        b.rating_sum as stored_sum,
        b.rating_counts as stored_counts,
        coalesce(e.review_count, 0) as expected_count,
        coalesce(e.rating_sum, 0) as expected_sum,
        coalesce(e.rating_counts, array[0, 0, 0, 0, 0]) as expected_counts
      from books b
      left join expected e on e.book_id = b.id
      where b.review_count is distinct from coalesce(e.review_count, 0)
        or b.rating_sum is distinct from coalesce(e.rating_sum, 0)
        or b.rating_counts is distinct from coalesce(e.rating_counts, array[0, 0, 0, 0, 0])`)
    const mismatches: RatingMismatch[] = rows.map((row) => ({
      bookId: row.book_id,
      stored: {
        reviewCount: row.stored_count,
        ratingSum: row.stored_sum,
        ratingCounts: row.stored_counts,
      },
      expected: {
        reviewCount: row.expected_count,
        ratingSum: row.expected_sum,
        ratingCounts: row.expected_counts,
      },
    }))
    for (const mismatch of mismatches) {
      await tx
        .update(books)
        .set({
          reviewCount: mismatch.expected.reviewCount,
          ratingSum: mismatch.expected.ratingSum,
          ratingCounts: mismatch.expected.ratingCounts,
        })
        .where(eq(books.id, mismatch.bookId))
    }
    const [{ total = 0 } = {}] = await tx.execute<{ total: number }>(
      sql`select count(*)::int as total from books`,
    )
    if (mismatches.length > 0) {
      log.error(
        { mismatches: mismatches.length, books: mismatches.slice(0, 20) },
        'rating aggregates were out of step and have been fixed',
      )
      captureError(
        new Error(`ratings.recompute fixed ${mismatches.length} Book(s) with wrong aggregates`),
      )
    }
    return { checked: total, mismatches }
  })
}
