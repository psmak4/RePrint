import {
  bookGenres,
  books,
  type Database,
  featuredItems,
  genres,
  helpfulVotes,
  reviews,
  reviewVersions,
  type SeedRandom,
} from '@reprint/db'
import { DISCOVER_FEATURED_GENRES, DISCOVER_TOP_RATED_MIN_REVIEWS } from '@reprint/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { applyReviewChange } from '../reviews/aggregates.js'
import { DAY_MS, loadSeedAccounts, pick, reviewText } from '../reviews/seed-reviews.js'

/** One number drives the Discover sample data, so two seeds create the same rows. */
export const DISCOVER_SEED = 20260104

/** How many Books get enough recent Approved reviews to appear in "Top rated" and "this month". */
const POPULAR_BOOKS = 8
/** Approved reviews each popular Book ends up with (one above the Top rated minimum). */
const APPROVED_PER_POPULAR_BOOK = DISCOVER_TOP_RATED_MIN_REVIEWS + 1
const MAX_VOTES_PER_REVIEW = 5
const FEATURED_GENRES = 6

export interface SeedDiscoverResult {
  reviews: number
  helpfulVotes: number
  featuredGenres: number
  featuredReview: boolean
  skipped: boolean
}

/**
 * Makes every Discover row show locally: tops up the first eight reviewed Books to six Approved
 * reviews each (the new ones decided within the last month, so "Top rated" and "Most reviewed this
 * month" both have Books), adds Helpful votes so "Most helpful" differs from "Newest", and picks
 * featured Genres and a featured review. Totals change through `applyReviewChange`, the same call
 * the API makes. Does nothing when any featured item exists. Needs the review seed to have run.
 */
export async function seedDiscover(
  db: Database,
  random: SeedRandom,
  log: (message: string) => void = () => {},
): Promise<SeedDiscoverResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: featuredItems.id }).from(featuredItems).limit(1)
    if (existing) {
      log('discover seed: featured items already exist, nothing to do')
      return {
        reviews: 0,
        helpfulVotes: 0,
        featuredGenres: 0,
        featuredReview: false,
        skipped: true,
      }
    }

    const { reviewers, moderators } = await loadSeedAccounts(tx)
    const popular = await tx
      .selectDistinct({ id: reviews.bookId, slug: books.slug })
      .from(reviews)
      .innerJoin(books, eq(books.id, reviews.bookId))
      .orderBy(asc(books.slug))
      .limit(POPULAR_BOOKS)
    if (popular.length < POPULAR_BOOKS || moderators.length === 0) {
      throw new Error('discover seed needs the users, Catalog, and review seeds to have run first')
    }
    const bookIds = popular.map((book) => book.id)

    // Real time on purpose: "Most reviewed this month" counts the last 30 days from today, so
    // the fixed seed clock would leave it empty. Only these dates vary between runs.
    const now = Date.now()
    const newReviews: (typeof reviews.$inferInsert)[] = []
    const newVersions: (typeof reviewVersions.$inferInsert)[] = []
    for (const bookId of bookIds) {
      const rows = await tx
        .select({ userId: reviews.userId, status: reviews.status })
        .from(reviews)
        .where(eq(reviews.bookId, bookId))
      const taken = new Set(rows.map((row) => row.userId))
      const pool = reviewers.filter((reviewer) => !taken.has(reviewer.id))
      let approved = rows.filter((row) => row.status === 'approved').length
      while (approved < APPROVED_PER_POPULAR_BOOK) {
        const reviewer = pool.splice(random.int(0, pool.length - 1), 1)[0]
        if (!reviewer) break
        const text = reviewText(random)
        const submittedAt = new Date(now - random.int(3, 25) * DAY_MS)
        const decidedAt = new Date(submittedAt.getTime() + random.int(1, 48) * 3_600_000)
        const reviewId = random.id()
        newReviews.push({
          id: reviewId,
          userId: reviewer.id,
          bookId,
          ...text,
          status: 'approved',
          submittedAt,
          decidedAt,
          createdAt: submittedAt,
          updatedAt: decidedAt,
        })
        newVersions.push({
          id: random.id(),
          reviewId,
          version: 1,
          ...text,
          status: 'approved',
          decidedBy: pick(random, moderators).id,
          decidedAt,
          createdAt: submittedAt,
        })
        await applyReviewChange(tx, bookId, null, { status: 'approved', rating: text.rating })
        approved++
      }
    }
    if (newReviews.length > 0) {
      await tx.insert(reviews).values(newReviews)
      await tx.insert(reviewVersions).values(newVersions)
    }

    // Helpful votes on every Approved review of those Books. On the first Book the oldest review
    // gets the most votes, so ordering by helpful differs from newest first.
    const approvedReviews = await tx
      .select({ id: reviews.id, userId: reviews.userId, bookId: reviews.bookId })
      .from(reviews)
      .where(and(inArray(reviews.bookId, bookIds), eq(reviews.status, 'approved')))
      .orderBy(asc(reviews.submittedAt), asc(reviews.id))
    const firstBookId = bookIds[0]
    const oldestOnFirstBook = approvedReviews.find((review) => review.bookId === firstBookId)
    const voteRows: (typeof helpfulVotes.$inferInsert)[] = []
    for (const review of approvedReviews) {
      const voters = reviewers.filter((reviewer) => reviewer.id !== review.userId)
      const count =
        review.id === oldestOnFirstBook?.id
          ? MAX_VOTES_PER_REVIEW + 2
          : random.int(0, MAX_VOTES_PER_REVIEW - 2)
      for (let i = 0; i < count && voters.length > 0; i++) {
        const voter = voters.splice(random.int(0, voters.length - 1), 1)[0]
        if (voter) voteRows.push({ reviewId: review.id, userId: voter.id })
      }
    }
    if (voteRows.length > 0) {
      await tx.insert(helpfulVotes).values(voteRows)
      await tx.execute(sql`update reviews r set helpful_count = (
        select count(*) from helpful_votes v where v.review_id = r.id)
        where r.id in (select review_id from helpful_votes)`)
    }

    // The featured review is the most helpful Approved review among those Books.
    const [top] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(inArray(reviews.bookId, bookIds), eq(reviews.status, 'approved')))
      .orderBy(desc(reviews.helpfulCount), asc(reviews.id))
      .limit(1)
    if (top) await tx.insert(featuredItems).values({ kind: 'review', refId: top.id, position: 0 })

    // Featured Genres: those with the most Books, so each link leads to a populated page.
    const featuredGenres = await tx
      .select({ id: genres.id })
      .from(genres)
      .innerJoin(bookGenres, eq(bookGenres.genreId, genres.id))
      .groupBy(genres.id, genres.name)
      .orderBy(desc(sql`count(*)`), asc(genres.name))
      .limit(Math.min(FEATURED_GENRES, DISCOVER_FEATURED_GENRES))
    if (featuredGenres.length > 0) {
      await tx.insert(featuredItems).values(
        featuredGenres.map((genre, position) => ({
          kind: 'genre' as const,
          refId: genre.id,
          position,
        })),
      )
    }

    log(
      `discover seed: ${newReviews.length} reviews, ${voteRows.length} helpful votes, ${featuredGenres.length} featured genres`,
    )
    return {
      reviews: newReviews.length,
      helpfulVotes: voteRows.length,
      featuredGenres: featuredGenres.length,
      featuredReview: Boolean(top),
      skipped: false,
    }
  })
}
