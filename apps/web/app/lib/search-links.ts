import { SEARCH_MIN_LENGTH, type SearchQuery, searchQuerySchema } from '@reprint/shared'

/** Where a not-yet-stored Book opens: the resolve route stores it, then redirects to its page. */
export function resolveHref(ref: string): string {
  return `/resolve?ref=${encodeURIComponent(ref)}`
}

/**
 * Reads the results-page query from the URL. A bad or empty parameter is dropped rather than
 * failing the page, so a hand-edited URL still shows results.
 */
export function parseSearchParams(params: URLSearchParams): SearchQuery {
  const raw: Record<string, string> = {}
  for (const [name, value] of params) if (value !== '' && !(name in raw)) raw[name] = value
  const whole = searchQuerySchema.safeParse(raw)
  if (whole.success) return whole.data
  const valid: Record<string, string> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (searchQuerySchema.safeParse({ [name]: value }).success) valid[name] = value
  }
  return searchQuerySchema.parse(valid)
}

export function isSearchable(query: SearchQuery): boolean {
  return query.q.length >= SEARCH_MIN_LENGTH
}

/** The results-page URL for a query, leaving out defaults so shared links stay short. */
export function searchHref(query: SearchQuery, overrides: Partial<SearchQuery> = {}): string {
  const next = { ...query, ...overrides }
  const params = new URLSearchParams()
  params.set('q', next.q)
  if (next.type !== 'books') params.set('type', next.type)
  if (next.genre) params.set('genre', next.genre)
  if (next.language) params.set('language', next.language)
  if (next.decade) params.set('decade', String(next.decade))
  if (next.minRating) params.set('minRating', String(next.minRating))
  if (next.sort !== 'relevance') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  return `/search?${params}`
}
