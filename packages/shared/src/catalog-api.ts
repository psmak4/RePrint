import { z } from 'zod'
import {
  authorSchema,
  bookSchema,
  contributionRoleSchema,
  contributionSchema,
  coverSchema,
  editionSchema,
  slugSchema,
} from './catalog.js'

/** Request and response shapes for the public catalog endpoints (PRD §7.4, §7.5, §10). */

export const slugParamsSchema = z.object({ slug: slugSchema })

/** How a Book's Approved Reviews add up. `average` is null until the first Review. */
export const ratingSummarySchema = z.object({
  average: z.number().min(1).max(5).nullable(),
  count: z.number().int().min(0),
  /** Approved Reviews at 1 to 5 stars, index 0 being one star. */
  distribution: z.array(z.number().int().min(0)).length(5),
})
export type RatingSummary = z.infer<typeof ratingSummarySchema>

/** `GET /books/:slug`: the Book with its Primary Edition and rating summary. */
export const bookDetailSchema = bookSchema.omit({ reviewCount: true }).extend({
  primaryEdition: editionSchema.nullable(),
  editionCount: z.number().int().min(0),
  rating: ratingSummarySchema,
})
export type BookDetail = z.infer<typeof bookDetailSchema>

/** `GET /books/:slug/editions`. */
export const bookEditionsResponseSchema = z.object({
  items: z.array(editionSchema),
})
export type BookEditionsResponse = z.infer<typeof bookEditionsResponseSchema>

/** A Book as listed on an Author page or in results: enough for a card. */
export const bookSummarySchema = z.object({
  id: bookSchema.shape.id,
  slug: slugSchema,
  title: bookSchema.shape.title,
  subtitle: bookSchema.shape.subtitle,
  cover: coverSchema.nullable(),
  contributions: z.array(contributionSchema),
  rating: ratingSummarySchema,
})
export type BookSummary = z.infer<typeof bookSummarySchema>

/** `GET /authors/:slug`: the Author and their Books grouped by Role, most reviewed first. */
export const authorDetailSchema = authorSchema.extend({
  works: z.array(
    z.object({
      role: contributionRoleSchema,
      books: z.array(bookSummarySchema),
    }),
  ),
})
export type AuthorDetail = z.infer<typeof authorDetailSchema>
