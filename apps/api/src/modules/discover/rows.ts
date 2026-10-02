import { type Database, featuredItems, genres, reviews, users } from '@reprint/db'
import {
  type BookSummary,
  DISCOVER_FEATURED_GENRES,
  DISCOVER_MIN_ROW_BOOKS,
  DISCOVER_RECENT_DAYS,
  DISCOVER_ROW_SIZE,
  DISCOVER_TOP_RATED_MIN_REVIEWS,
  type DiscoverResponse,
  type FeaturedReview,
  type GenreLink,
  WEIGHTED_RATING_C,
} from '@reprint/shared'
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { loadBookSummaries } from '../catalog/read.js'

/** Approved, not auto-hidden (D-040) reviews by Members whose account still exists (D-043). */
const PUBLIC_REVIEW = sql`r.status = 'approved' and r.hidden_at is null
  and not exists (select 1 from users u where u.id = r.user_id and u.status = 'deleted')`

/** The site-wide mean rating `m` over every Book; 0 when nothing is rated yet (D-133). */
export async function computeSiteMean(db: Database): Promise<number> {
  const [row] = await db.execute<{ mean: number }>(
    sql`select coalesce(sum(rating_sum)::float8 / nullif(sum(review_count), 0), 0) as mean from books`,
  )
  return row?.mean ?? 0
}

/** A row needs enough Books to look like a row; otherwise it is hidden (PRD §7.2). */
function visible(items: BookSummary[]): BookSummary[] | null {
  return items.length >= DISCOVER_MIN_ROW_BOOKS ? items : null
}

async function ids(db: Database, query: ReturnType<typeof sql>): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(query)
  return rows.map((row) => row.id)
}

/** Books with the newest Approved reviews, one card per Book. */
export async function buildRecentlyReviewed(db: Database): Promise<BookSummary[] | null> {
  const bookIds = await ids(
    db,
    sql`select r.book_id as id from reviews r where ${PUBLIC_REVIEW}
      group by r.book_id
      order by max(r.decided_at) desc nulls last, r.book_id
      limit ${DISCOVER_ROW_SIZE}`,
  )
  return visible(await loadBookSummaries(db, bookIds))
}

/** Books ranked by the weighted average, with at least 5 Approved reviews (PRD §7.2, §7.6). */
export async function buildTopRated(db: Database, siteMean: number): Promise<BookSummary[] | null> {
  const bookIds = await ids(
    db,
    sql`select b.id from books b
      where b.review_count >= ${DISCOVER_TOP_RATED_MIN_REVIEWS}
      order by ((${WEIGHTED_RATING_C}::float8 * ${siteMean}::float8 + b.rating_sum)
                / (${WEIGHTED_RATING_C} + b.review_count)) desc,
               b.review_count desc, b.id
      limit ${DISCOVER_ROW_SIZE}`,
  )
  return visible(await loadBookSummaries(db, bookIds))
}

/** Books with the most Approved reviews decided in the last 30 days. */
export async function buildMostReviewedThisMonth(
  db: Database,
  now: Date,
): Promise<BookSummary[] | null> {
  const since = new Date(now.getTime() - DISCOVER_RECENT_DAYS * 24 * 60 * 60 * 1000)
  const bookIds = await ids(
    db,
    sql`select r.book_id as id from reviews r
      where ${PUBLIC_REVIEW} and r.decided_at >= ${since.toISOString()}::timestamptz
      group by r.book_id
      order by count(*) desc, max(r.decided_at) desc, r.book_id
      limit ${DISCOVER_ROW_SIZE}`,
  )
  return visible(await loadBookSummaries(db, bookIds))
}

/** The Genres admins picked, in their chosen order; `null` when none are picked. */
export async function buildFeaturedGenres(db: Database): Promise<GenreLink[] | null> {
  const rows = await db
    .select({ slug: genres.slug, name: genres.name })
    .from(featuredItems)
    .innerJoin(genres, eq(genres.id, featuredItems.refId))
    .where(eq(featuredItems.kind, 'genre'))
    .orderBy(asc(featuredItems.position), asc(genres.name))
    .limit(DISCOVER_FEATURED_GENRES)
  return rows.length > 0 ? rows : null
}

/** The first picked review that is still Approved, with its Book; `null` when there is none. */
export async function buildFeaturedReview(db: Database): Promise<FeaturedReview | null> {
  const picks = await db
    .select({ refId: featuredItems.refId })
    .from(featuredItems)
    .where(eq(featuredItems.kind, 'review'))
    .orderBy(asc(featuredItems.position), asc(featuredItems.createdAt))
  if (picks.length === 0) return null
  const rows = await db
    .select({
      id: reviews.id,
      bookId: reviews.bookId,
      rating: reviews.rating,
      headline: reviews.headline,
      body: reviews.body,
      hasSpoilers: reviews.hasSpoilers,
      helpfulCount: reviews.helpfulCount,
      submittedAt: reviews.submittedAt,
      username: users.username,
      displayName: users.displayName,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(
      and(
        inArray(
          reviews.id,
          picks.map((pick) => pick.refId),
        ),
        eq(reviews.status, 'approved'),
        isNull(reviews.hiddenAt),
        ne(users.status, 'deleted'),
      ),
    )
  // A pick that was unpublished or erased is skipped; the next pick in order takes its place.
  const row = picks.flatMap((pick) => rows.filter((candidate) => candidate.id === pick.refId))[0]
  if (!row) return null
  const [book] = await loadBookSummaries(db, [row.bookId])
  if (!book) return null
  const { bookId: _bookId, username, displayName, submittedAt, ...review } = row
  return {
    review: {
      ...review,
      submittedAt: submittedAt.toISOString(),
      author: { username, displayName },
    },
    book,
  }
}

export const DISCOVER_ROW_KEYS = [
  'recentlyReviewed',
  'topRated',
  'mostReviewedThisMonth',
  'featuredGenres',
  'featuredReview',
] as const
export type DiscoverRowKey = (typeof DISCOVER_ROW_KEYS)[number]

/** Builds one row. `siteMean` is the cached `m`, so Top rated does not recompute it. */
export function buildRow<Key extends DiscoverRowKey>(
  db: Database,
  key: Key,
  context: { siteMean: number; now: Date },
): Promise<DiscoverResponse[Key]> {
  const builders: { [K in DiscoverRowKey]: () => Promise<DiscoverResponse[K]> } = {
    recentlyReviewed: () => buildRecentlyReviewed(db),
    topRated: () => buildTopRated(db, context.siteMean),
    mostReviewedThisMonth: () => buildMostReviewedThisMonth(db, context.now),
    featuredGenres: () => buildFeaturedGenres(db),
    featuredReview: () => buildFeaturedReview(db),
  }
  return builders[key]()
}
