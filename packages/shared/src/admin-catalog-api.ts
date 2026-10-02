import { z } from 'zod'
import { contributionRoleSchema, coverSchema, fieldOriginsSchema } from './catalog.js'

/** Schemas for the Admin Catalog editing endpoint (PRD §5.2, §5.4, §7.11, D-155). */

export const adminBookParamsSchema = z.object({ id: z.uuid() })

/** An existing Author, or a new one by name (never matched to another Author by name, D-100). */
export const adminContributionInputSchema = z
  .object({
    authorId: z.uuid().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    role: contributionRoleSchema,
  })
  .refine((value) => (value.authorId === undefined) !== (value.name === undefined), {
    message: 'Give either an existing Author or a new Author name.',
    path: ['authorId'],
  })

export const adminSeriesInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** May be decimal (2.5) or empty. */
  position: z.number().min(0).max(100_000).nullable().default(null),
})

/**
 * `PATCH /admin/books/:id`. Only the fields present are edited; each one becomes an admin field and is
 * locked. `genreIds`, `series`, and `contributions` replace the whole list.
 */
export const adminBookEditSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).nullable(),
    genreIds: z.array(z.uuid()).max(20),
    series: z.array(adminSeriesInputSchema).max(10),
    contributions: z.array(adminContributionInputSchema).min(1).max(50),
    /** One of the Book's own Editions; it replaces the automatic choice and is locked. */
    primaryEditionId: z.uuid(),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Change at least one field.',
  })
export type AdminBookEdit = z.infer<typeof adminBookEditSchema>

export const adminBookSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  genres: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.string() })),
  series: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      position: z.number().nullable(),
    }),
  ),
  contributions: z.array(
    z.object({
      authorId: z.uuid(),
      name: z.string(),
      role: contributionRoleSchema,
      position: z.number().int().nullable(),
    }),
  ),
  cover: coverSchema.nullable(),
  primaryEditionId: z.uuid().nullable(),
  /** Fields a refresh never overwrites. */
  lockedFields: z.array(z.string()),
  fieldOrigins: fieldOriginsSchema,
})
export type AdminBook = z.infer<typeof adminBookSchema>

/** The widest an uploaded Book cover is stored; narrower images are kept as they are. */
export const BOOK_COVER_MAX_WIDTH = 600

/** `POST /admin/books/:id/cover` returns the Book as an Admin sees it. */
export const adminBookCoverResponseSchema = adminBookSchema

/** `POST /admin/books/:id/refresh` queues the re-fetch and returns at once. */
export const adminBookRefreshResponseSchema = z.object({ status: z.literal('refresh_queued') })
export type AdminBookRefreshResponse = z.infer<typeof adminBookRefreshResponseSchema>
