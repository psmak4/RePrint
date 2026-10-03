import { z } from 'zod'
import { bookSummarySchema } from './catalog-api.js'
import { pageOf, pageQuerySchema } from './pagination.js'
import { publicReviewSchema } from './reviews.js'

/** Response shapes for public profiles (PRD §7.8, §10). `usernameParamsSchema` is in `library-api`. */

/** `GET /users/:username`: what anyone may see of a Member. No email, no status. */
export const profileSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  /** Absolute URL of the Member's avatar, or null when none is uploaded. */
  avatarUrl: z.string().nullable(),
  joinedAt: z.iso.datetime(),
  /** Approved Reviews only. */
  reviewCount: z.number().int().min(0),
  /** Helpful votes on the Member's Approved Reviews. */
  helpfulVotes: z.number().int().min(0),
  /** Whether the Library tab is shown to everyone (the owner always sees it). */
  libraryPublic: z.boolean(),
  /** Whether the Member has verified their email; search engines are told to skip unverified profiles. */
  verified: z.boolean(),
})
export type Profile = z.infer<typeof profileSchema>

/** `GET /users/:username/reviews?page=&pageSize=`. */
export const profileReviewsQuerySchema = pageQuerySchema
export type ProfileReviewsQuery = z.infer<typeof profileReviewsQuerySchema>

/** An Approved Review on a profile: the review and the Book it is about. */
export const profileReviewSchema = publicReviewSchema.omit({ author: true }).extend({
  book: bookSummarySchema,
})
export type ProfileReview = z.infer<typeof profileReviewSchema>

export const profileReviewsResponseSchema = pageOf(profileReviewSchema)
export type ProfileReviewsResponse = z.infer<typeof profileReviewsResponseSchema>
