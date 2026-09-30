import { z } from 'zod'
import { authorSchema } from './catalog.js'
import { bookSummarySchema } from './catalog-api.js'

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
