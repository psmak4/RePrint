import { z } from 'zod'
import { authorSchema, contributionRoleSchema, coverSchema } from './catalog.js'
import { bookSummarySchema, candidateRefSchema } from './catalog-api.js'

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

/** `GET /search?q=&page=`. A query under `SEARCH_MIN_LENGTH` is valid and finds nothing. */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).default(''),
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
  z.object({ kind: z.literal('book'), book: bookSummarySchema }),
  z.object({ kind: z.literal('candidate'), candidate: searchCandidateSchema }),
])
export type SearchResultItem = z.infer<typeof searchResultItemSchema>

export const searchResponseSchema = z.object({
  items: z.array(searchResultItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
  /** True when the Source was slow or down, so only Catalog results are shown (PRD §6). */
  sourceUnavailable: z.boolean(),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>
