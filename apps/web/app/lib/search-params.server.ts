import { type SearchQuery, searchQuerySchema } from '@reprint/shared'

// Only the search loader reads the query from the URL, so the schema stays out of the page's
// JavaScript (M10-T14).

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
