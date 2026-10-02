import { z } from 'zod'
import { DISCOVER_FEATURED_GENRES, featuredReviewSchema } from './discover-api.js'
import { genreLinkSchema } from './genres-api.js'

/** Schemas for the featured-content endpoints (PRD §7.2, §7.11, D-045, D-161). */

/** Approved reviews offered to pick from, most helpful first. */
export const ADMIN_FEATURED_CANDIDATES = 20

export const adminFeaturedGenreSchema = genreLinkSchema.extend({ id: z.uuid() })
export type AdminFeaturedGenre = z.infer<typeof adminFeaturedGenreSchema>

/** `GET /admin/featured`: the current picks and what can be picked. */
export const adminFeaturedSchema = z.object({
  /** The featured Genres in display order. */
  genres: z.array(adminFeaturedGenreSchema),
  /** Every live Genre, for choosing the featured ones. */
  genreOptions: z.array(adminFeaturedGenreSchema),
  /** The pick, with its Book; `null` when none is set or the pick is no longer Approved. */
  review: featuredReviewSchema.nullable(),
  candidates: z.array(featuredReviewSchema),
})
export type AdminFeatured = z.infer<typeof adminFeaturedSchema>

/**
 * `PUT /admin/featured`. Only the parts present change. `genreIds` replaces the whole ordered list
 * (Admins only); `reviewId` sets the one featured review, or clears it with `null`.
 */
export const adminFeaturedUpdateSchema = z
  .object({
    genreIds: z
      .array(z.uuid())
      .max(DISCOVER_FEATURED_GENRES)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'List each Genre once.' }),
    reviewId: z.uuid().nullable(),
  })
  .partial()
  .refine((value) => value.genreIds !== undefined || value.reviewId !== undefined, {
    message: 'Change the featured Genres or the featured review.',
  })
export type AdminFeaturedUpdate = z.infer<typeof adminFeaturedUpdateSchema>
