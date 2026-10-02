import { z } from 'zod'
import { bookSummarySchema } from './catalog-api.js'
import { genreLinkSchema } from './genres-api.js'
import { publicReviewSchema } from './reviews.js'

/** Response shape for the Discover home page (PRD §7.2, §10). */

/** Books shown in each Discover row. */
export const DISCOVER_ROW_SIZE = 12
/** A row with fewer Books than this is hidden until it fills (PRD §7.2). */
export const DISCOVER_MIN_ROW_BOOKS = 6
/** "Top rated" needs at least this many Approved reviews per Book (PRD §7.2). */
export const DISCOVER_TOP_RATED_MIN_REVIEWS = 5
/** "Most reviewed this month" counts Approved reviews decided in this many days. */
export const DISCOVER_RECENT_DAYS = 30
/** Featured Genres on the home page. */
export const DISCOVER_FEATURED_GENRES = 12

export const FEATURED_KINDS = ['genre', 'review'] as const
export const featuredKindSchema = z.enum(FEATURED_KINDS)
export type FeaturedKind = z.infer<typeof featuredKindSchema>

export const featuredReviewSchema = z.object({
  review: publicReviewSchema,
  book: bookSummarySchema,
})
export type FeaturedReview = z.infer<typeof featuredReviewSchema>

/** `GET /discover`: every row, or `null` for a row that is hidden (too few Books, or nothing chosen). */
export const discoverResponseSchema = z.object({
  recentlyReviewed: z.array(bookSummarySchema).nullable(),
  topRated: z.array(bookSummarySchema).nullable(),
  mostReviewedThisMonth: z.array(bookSummarySchema).nullable(),
  featuredGenres: z.array(genreLinkSchema).nullable(),
  featuredReview: featuredReviewSchema.nullable(),
})
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>
