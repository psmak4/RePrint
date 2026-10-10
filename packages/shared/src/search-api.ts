import { z } from 'zod'
import {
  authorSchema,
  contributionRoleSchema,
  coverSchema,
  languageSchema,
  slugSchema,
} from './catalog.js'
import { bookSummarySchema, candidateRefSchema } from './catalog-api.js'
import { reviewExcerptSchema } from './reviews.js'

/** Request and response shapes for Catalog search (PRD §7.3, §10). */

/** Longest query the search box accepts. */
export const SEARCH_QUERY_MAX_LENGTH = 100
/** Suggestions and search start at this many characters (PRD §7.3). */
export const SEARCH_MIN_LENGTH = 2

/** `GET /search/suggest?q=`. A query under `SEARCH_MIN_LENGTH` is valid and suggests nothing. */
export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).default(''),
})
export type SearchSuggestQuery = z.infer<typeof searchSuggestQuerySchema>

export const authorSuggestionSchema = authorSchema.pick({ id: true, slug: true, name: true })
export type AuthorSuggestion = z.infer<typeof authorSuggestionSchema>

export const searchSuggestResponseSchema = z.object({
  books: z.array(bookSummarySchema),
  authors: z.array(authorSuggestionSchema),
})
export type SearchSuggestResponse = z.infer<typeof searchSuggestResponseSchema>

/** Results per page (PRD §7.3). */
export const SEARCH_PAGE_SIZE = 20

export const SEARCH_TYPES = ['books', 'authors'] as const
export const SEARCH_SORTS = ['relevance', 'most_reviewed', 'highest_rated', 'newest'] as const
export type SearchSort = (typeof SEARCH_SORTS)[number]

/**
 * `GET /search?q=&type=&genre=&language=&decade=&minRating=&sort=&page=`. A query under
 * `SEARCH_MIN_LENGTH` is valid and finds nothing. `genre`, `language`, and `minRating` limit results
 * to the Catalog; `decade` (the first year, such as 1990) applies to every result (PRD §7.3).
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).default(''),
  type: z.enum(SEARCH_TYPES).default('books'),
  genre: slugSchema.optional(),
  language: languageSchema.optional(),
  decade: z.coerce
    .number()
    .int()
    .min(1000)
    .max(2990)
    .refine((year) => year % 10 === 0, 'Must be the first year of a decade, such as 1990')
    .optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(SEARCH_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).max(50).default(1),
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

/** A Book that the Source found but RePrint has not stored yet: shown as "not yet on RePrint". */
export const searchCandidateSchema = z.object({
  /** Opaque; pass it to `POST /books/resolve` to store the Book and get its slug (D-033). */
  ref: candidateRefSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  cover: coverSchema.nullable(),
  firstPublishedYear: z.number().int().min(1).max(9999).nullable(),
  contributions: z.array(z.object({ authorName: z.string(), role: contributionRoleSchema })),
})
export type SearchCandidate = z.infer<typeof searchCandidateSchema>

export const searchResultItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('book'),
    book: bookSummarySchema,
    /** The Book's most helpful eligible review, ties to newest; `null` when it has none (D-177). */
    topReview: reviewExcerptSchema.nullable(),
  }),
  z.object({ kind: z.literal('candidate'), candidate: searchCandidateSchema }),
  z.object({ kind: z.literal('author'), author: authorSuggestionSchema }),
])
export type SearchResultItem = z.infer<typeof searchResultItemSchema>

/** Where an ISBN query leads: a stored Book by slug, or a candidate by reference (PRD §7.3). */
export const isbnMatchSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('book'), slug: slugSchema }),
  z.object({ kind: z.literal('candidate'), ref: candidateRefSchema }),
])
export type IsbnMatch = z.infer<typeof isbnMatchSchema>

export const searchResponseSchema = z.object({
  items: z.array(searchResultItemSchema),
  /** Set when the query is a 10- or 13-digit ISBN with an exact match; the web goes straight there. */
  isbnMatch: isbnMatchSchema.nullable(),
  page: z.number().int().min(1),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
  /** True when the Source was slow or down, so only Catalog results are shown (PRD §6). */
  sourceUnavailable: z.boolean(),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
