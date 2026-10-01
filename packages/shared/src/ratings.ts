import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from './reviews.js'

/** `C` in the weighted rating: how many reviews at the site-wide average a Book starts with (PRD §7.6). */
export const WEIGHTED_RATING_C = 5

/** A Book's cached totals over its Approved reviews (the `books` aggregate columns). */
export interface RatingTotals {
  reviewCount: number
  ratingSum: number
}

/**
 * The ranking score `(C × m + Σ ratings) / (C + n)` (PRD §7.6), where `m` is the site-wide average
 * rating and `n` the Book's review count. A Book with no reviews scores `m`, and one 5-star review
 * does not outrank many good ones.
 */
export function weightedRating(
  { reviewCount, ratingSum }: RatingTotals,
  siteMean: number,
  c: number = WEIGHTED_RATING_C,
): number {
  return (c * siteMean + ratingSum) / (c + reviewCount)
}

/** The site-wide average rating `m` from every Book's totals; `fallback` when nothing is rated yet. */
export function siteMeanRating(totals: Iterable<RatingTotals>, fallback = 0): number {
  let count = 0
  let sum = 0
  for (const total of totals) {
    count += total.reviewCount
    sum += total.ratingSum
  }
  return count === 0 ? fallback : sum / count
}

/** The average shown to readers, rounded to one decimal; `null` when there are no reviews. */
export function averageRating({ reviewCount, ratingSum }: RatingTotals): number | null {
  if (reviewCount === 0) return null
  return Math.round((ratingSum / reviewCount) * 10) / 10
}

export interface RatingBucket {
  rating: number
  count: number
  /** This bucket's fraction of all reviews, 0 to 1; 0 when there are none. */
  share: number
}

/**
 * The 5-bar distribution from the cached `rating_counts` (index 0 is 1 star), listed 5 stars first
 * as the chart shows it.
 */
export function ratingDistribution(ratingCounts: readonly number[]): RatingBucket[] {
  const total = ratingCounts.reduce((sum, count) => sum + count, 0)
  const buckets: RatingBucket[] = []
  for (let rating = REVIEW_RATING_MAX; rating >= REVIEW_RATING_MIN; rating--) {
    const count = ratingCounts[rating - 1] ?? 0
    buckets.push({ rating, count, share: total === 0 ? 0 : count / total })
  }
  return buckets
}
