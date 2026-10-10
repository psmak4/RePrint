import { z } from 'zod'
import { idSchema } from './ids.js'
import { isValidIsbn13 } from './isbn.js'
import { COVER_ORIGINS } from './permissions.js'

/** Catalog domain types (PRD §5.1, §5.2, §5.4). Adapters must return exactly these shapes. */

export const CONTRIBUTION_ROLES = [
  'author',
  'co_author',
  'translator',
  'illustrator',
  'editor',
  'narrator',
  'other',
] as const
export const contributionRoleSchema = z.enum(CONTRIBUTION_ROLES)
export type ContributionRole = z.infer<typeof contributionRoleSchema>

export const FORMATS = ['hardcover', 'paperback', 'ebook', 'audiobook', 'unknown'] as const
export const formatSchema = z.enum(FORMATS)
export type Format = z.infer<typeof formatSchema>

/** An ISO 639-1 (two letters) or ISO 639-3 (three letters) code, lowercase. */
export const languageSchema = z
  .string()
  .regex(/^[a-z]{2,3}$/, 'Must be an ISO 639 language code in lowercase')
export type Language = z.infer<typeof languageSchema>

export const isbn13Schema = z
  .string()
  .regex(/^\d{13}$/, 'Must be 13 digits')
  .refine(isValidIsbn13, 'Must be a valid ISBN-13')

export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase slug')

/** A calendar date as `YYYY-MM-DD`; a Source that knows only the year or month is stored as such by the caller. */
export const isoDateSchema = z.iso.date()

/** `upload` files live in RePrint storage; the other origins are hosted by a Source (`COVER_ORIGINS`, PRD §9). */
export const coverOriginSchema = z.enum(COVER_ORIGINS)

export const coverSchema = z.object({
  origin: coverOriginSchema,
  /** The origin's own handle for the image, such as a cover ID. Never a Source record ID for a Book. */
  originRef: z.string().min(1).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** Where the image is served from, when the origin is not resolved by the web app from `originRef`. */
  url: z.url().nullable(),
})
export type Cover = z.infer<typeof coverSchema>

/** A Source names where a field came from, or `admin` when a person set (and so locked) it. */
export const fieldOriginSchema = z.object({
  source: z.string().min(1),
  at: z.iso.datetime(),
})
export type FieldOrigin = z.infer<typeof fieldOriginSchema>
export const fieldOriginsSchema = z.record(z.string(), fieldOriginSchema)
export type FieldOrigins = z.infer<typeof fieldOriginsSchema>

export const authorSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().trim().min(1),
  alternateNames: z.array(z.string().trim().min(1)),
  bio: z.string().nullable(),
  birthDate: isoDateSchema.nullable(),
  deathDate: isoDateSchema.nullable(),
  photo: coverSchema.nullable(),
})
export type Author = z.infer<typeof authorSchema>

/** An Author linked to a Book with a Role; `position` orders the byline. */
export const contributionSchema = z.object({
  author: authorSchema.pick({ id: true, slug: true, name: true }),
  role: contributionRoleSchema,
  position: z.number().int().min(0).nullable(),
})
export type Contribution = z.infer<typeof contributionSchema>

export const editionSchema = z.object({
  id: idSchema,
  bookId: idSchema,
  isbn13: isbn13Schema.nullable(),
  format: formatSchema,
  language: languageSchema.nullable(),
  title: z.string().trim().min(1).nullable(),
  publisherName: z.string().trim().min(1).nullable(),
  publishedDate: isoDateSchema.nullable(),
  pageCount: z.number().int().positive().nullable(),
  cover: coverSchema.nullable(),
})
export type Edition = z.infer<typeof editionSchema>

/** A Book's place in a Series. The position can be decimal (2.5 for a novella) or empty. */
export const seriesMembershipSchema = z.object({
  series: z.object({ slug: slugSchema, name: z.string().trim().min(1) }),
  position: z.number().min(0).nullable(),
})
export type SeriesMembership = z.infer<typeof seriesMembershipSchema>

export const GENRE_ORIGINS = ['mapping', 'admin'] as const
export const genreOriginSchema = z.enum(GENRE_ORIGINS)
export type GenreOrigin = z.infer<typeof genreOriginSchema>

export const genreSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  name: z.string().trim().min(1),
  description: z.string().nullable(),
  parentId: idSchema.nullable(),
  featured: z.boolean(),
})
export type Genre = z.infer<typeof genreSchema>

/** A raw Source tag. It improves search and maps to Genres, and is never shown as a category. */
export const subjectSchema = z.object({
  label: z.string().trim().min(1),
})
export type Subject = z.infer<typeof subjectSchema>

export const sourceLinkSchema = z.object({
  source: z.string().min(1),
  entityType: z.enum(['book', 'edition', 'author', 'series']),
  sourceId: z.string().min(1),
})
export type SourceLink = z.infer<typeof sourceLinkSchema>

export const bookSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1).nullable(),
  description: z.string().nullable(),
  firstPublishedYear: z.number().int().min(1).max(9999).nullable(),
  originalLanguage: languageSchema.nullable(),
  primaryEditionId: idSchema.nullable(),
  cover: coverSchema.nullable(),
  contributions: z.array(contributionSchema).min(1),
  series: z.array(seriesMembershipSchema),
  genres: z.array(genreSchema.pick({ slug: true, name: true })),
  reviewCount: z.number().int().min(0),
})
export type Book = z.infer<typeof bookSchema>

/**
 * What a Source adapter returns for a Book: a RePrint Book with at least one Edition and the Source link
 * (PRD §6), so it carries no RePrint IDs yet. Anything that fails validation is logged and skipped.
 */
export const bookCandidateBookSchema = z.object({
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1).nullable(),
  description: z.string().nullable(),
  firstPublishedYear: z.number().int().min(1).max(9999).nullable(),
  originalLanguage: languageSchema.nullable(),
  cover: coverSchema.nullable(),
  contributions: z
    .array(
      z.object({
        authorName: z.string().trim().min(1),
        role: contributionRoleSchema,
        position: z.number().int().min(0).nullable(),
        /** The Source link for the Author, so the ingest service can call `getAuthor`. */
        sourceLink: sourceLinkSchema.optional(),
      }),
    )
    .min(1),
  series: z.array(
    z.object({ name: z.string().trim().min(1), position: z.number().min(0).nullable() }),
  ),
  subjects: z.array(subjectSchema),
  /** How many Editions the Source knows of in all, when it says; it may send only some of them. */
  sourceEditionCount: z.number().int().min(0).nullable().optional(),
})

export const bookCandidateEditionSchema = editionSchema
  .omit({ id: true, bookId: true })
  .extend({ sourceLink: sourceLinkSchema.optional() })
export type BookCandidateEdition = z.infer<typeof bookCandidateEditionSchema>

export const bookCandidateSchema = z.object({
  book: bookCandidateBookSchema,
  editions: z.array(bookCandidateEditionSchema).min(1),
  sourceLink: sourceLinkSchema,
  /** How sure the Source is that this result matches the query, from 0 to 1. */
  confidence: z.number().min(0).max(1),
})
export type BookCandidate = z.infer<typeof bookCandidateSchema>

/** What a Source adapter returns for an Author: the fields RePrint shows, plus the Source link. */
export const authorRecordSchema = authorSchema
  .omit({ id: true, slug: true })
  .extend({ sourceLink: sourceLinkSchema })
export type AuthorRecord = z.infer<typeof authorRecordSchema>

/** One page of Book candidates for a search. */
export const bookSearchPageSchema = z.object({
  candidates: z.array(bookCandidateSchema),
  page: z.number().int().min(1),
  hasMore: z.boolean(),
})
export type BookSearchPage = z.infer<typeof bookSearchPageSchema>
