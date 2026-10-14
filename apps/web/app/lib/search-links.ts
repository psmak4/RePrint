import { SEARCH_MIN_LENGTH, type SearchQuery } from '@reprint/shared'

/** Where a not-yet-stored Book opens: the resolve route stores it, then redirects to its page. */
export function resolveHref(ref: string): string {
  return `/resolve?ref=${encodeURIComponent(ref)}`
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
