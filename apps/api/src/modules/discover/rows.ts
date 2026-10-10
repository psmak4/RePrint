import { type Database, featuredItems, genres, reviews, users } from '@reprint/db'
import {
  type BookSummary,
  DISCOVER_FEATURED_GENRES,
  DISCOVER_JUST_APPROVED_SIZE,
  DISCOVER_MIN_JUST_APPROVED,
  DISCOVER_MIN_ROW_BOOKS,
  DISCOVER_RECENT_DAYS,
  DISCOVER_ROW_SIZE,
  DISCOVER_TOP_RATED_MIN_REVIEWS,
  type DiscoverResponse,
  type FeaturedReview,
  type GenreLink,
  type JustApprovedItem,
  type MostReviewedItem,
  WEIGHTED_RATING_C,
} from '@reprint/shared'
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { loadBookSummaries } from '../catalog/read.js'
import {
  EXCERPT_COLUMNS,
  EXCERPTABLE_REVIEW,
  type ExcerptRow,
  toExcerpt,
} from '../reviews/excerpts.js'

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

/** Books with the most Approved reviews decided in the last 30 days, with that count. */
export async function buildMostReviewedThisMonth(
  db: Database,
  now: Date,
): Promise<MostReviewedItem[] | null> {
  const since = new Date(now.getTime() - DISCOVER_RECENT_DAYS * 24 * 60 * 60 * 1000)
  const ranked = await db.execute<{ id: string; recent_review_count: number }>(
    sql`select r.book_id as id, count(*)::int as recent_review_count from reviews r
      where ${PUBLIC_REVIEW} and r.decided_at >= ${since.toISOString()}::timestamptz
      group by r.book_id
      order by count(*) desc, max(r.decided_at) desc, r.book_id
      limit ${DISCOVER_ROW_SIZE}`,
  )
  const summaries = await loadBookSummaries(
    db,
    ranked.map((row) => row.id),
  )
  const items = ranked.flatMap((row) => {
    const book = summaries.find((summary) => summary.id === row.id)
    return book ? [{ ...book, recentReviewCount: row.recent_review_count }] : []
  })
  return items.length >= DISCOVER_MIN_ROW_BOOKS ? items : null
}

/** The Genres admins picked, in their chosen order; `null` when none are picked. */
export async function buildFeaturedGenres(db: Database): Promise<GenreLink[] | null> {
  const rows = await db
    .select({ slug: genres.slug, name: genres.name })
    .from(featuredItems)
    .innerJoin(genres, eq(genres.id, featuredItems.refId))
    .where(and(eq(featuredItems.kind, 'genre'), isNull(genres.archivedAt)))
    .orderBy(asc(featuredItems.position), asc(genres.name))
    .limit(DISCOVER_FEATURED_GENRES)
  return rows.length > 0 ? rows : null
}

/**
 * The given reviews that are publicly visible (Approved, not auto-hidden, author not deleted), each
 * with its Book, in the order given. Others are skipped.
 */
export async function loadFeaturedReviews(
  db: Database,
  reviewIds: string[],
): Promise<FeaturedReview[]> {
  if (reviewIds.length === 0) return []
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
        inArray(reviews.id, reviewIds),
        eq(reviews.status, 'approved'),
        isNull(reviews.hiddenAt),
        ne(users.status, 'deleted'),
      ),
    )
  const ordered = reviewIds.flatMap((id) => rows.filter((candidate) => candidate.id === id))
  const summaries = await loadBookSummaries(db, [...new Set(ordered.map((row) => row.bookId))])
  return ordered.flatMap(({ bookId, username, displayName, submittedAt, ...review }) => {
    const book = summaries.find((summary) => summary.id === bookId)
    if (!book) return []
    return [
      {
        review: {
          ...review,
          submittedAt: submittedAt.toISOString(),
          author: { username, displayName },
        },
        book,
      },
    ]
  })
}

/** The first picked review that is still Approved, with its Book; `null` when there is none. */
export async function buildFeaturedReview(db: Database): Promise<FeaturedReview | null> {
  const picks = await db
    .select({ refId: featuredItems.refId })
    .from(featuredItems)
    .where(eq(featuredItems.kind, 'review'))
    .orderBy(asc(featuredItems.position), asc(featuredItems.createdAt))
  // A pick that was unpublished or erased is skipped; the next pick in order takes its place.
  const [first] = await loadFeaturedReviews(
    db,
    picks.map((pick) => pick.refId),
  )
  return first ?? null
}

/** The newest excerptable reviews, one per Book (D-177); hidden under 3 items. */
export async function buildJustApproved(db: Database): Promise<JustApprovedItem[] | null> {
  const rows = await db.execute<ExcerptRow>(
    sql`select * from (
        select distinct on (r.book_id) ${EXCERPT_COLUMNS}
        from reviews r join users au on au.id = r.user_id
        where ${EXCERPTABLE_REVIEW}
        order by r.book_id, coalesce(r.decided_at, r.submitted_at) desc, r.id
      ) newest
      order by approved_at desc, id
      limit ${DISCOVER_JUST_APPROVED_SIZE}`,
  )
  const summaries = await loadBookSummaries(db, [...new Set(rows.map((row) => row.book_id))])
  const items = rows.flatMap((row) => {
    const book = summaries.find((summary) => summary.id === row.book_id)
    return book ? [{ review: toExcerpt(row), book }] : []
  })
  return items.length >= DISCOVER_MIN_JUST_APPROVED ? items : null
}

export const DISCOVER_ROW_KEYS = [
  'recentlyReviewed',
  'topRated',
  'mostReviewedThisMonth',
  'featuredGenres',
  'featuredReview',
  'justApproved',
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
    justApproved: () => buildJustApproved(db),
  }
  return builders[key]()
}
