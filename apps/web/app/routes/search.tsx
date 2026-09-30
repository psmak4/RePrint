import { APP_NAME, searchResponseSchema } from '@reprint/shared'
import { data, redirect } from 'react-router'
import { SearchResultsPage } from '../components/search/search-results-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { isSearchable, parseSearchParams, resolveHref, searchHref } from '../lib/search-links.js'
import type { Route } from './+types/search'

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${APP_NAME}: ${copy.search.title(loaderData?.query.q ?? '')}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** Results come from the API on first load (PRD §7.3); an ISBN with an exact match goes straight to the Book. */
export async function loader({ request }: Route.LoaderArgs) {
  const query = parseSearchParams(new URL(request.url).searchParams)
  if (!isSearchable(query)) return { query, results: null, failed: false }
  try {
    const response = await apiClientFor(request).get(
      `/v1/search?${new URL(searchHref(query), 'http://x').searchParams}`,
    )
    if (!response.ok) {
      logger.error({ status: response.status }, 'search failed')
      return data({ query, results: null, failed: true }, { status: 502 })
    }
    const results = searchResponseSchema.parse(await response.json())
    if (results.isbnMatch?.kind === 'book') throw redirect(`/books/${results.isbnMatch.slug}`)
    if (results.isbnMatch?.kind === 'candidate') throw redirect(resolveHref(results.isbnMatch.ref))
    return { query, results, failed: false }
  } catch (error) {
    if (error instanceof Response) throw error
    logger.error({ err: error }, 'could not load search results')
    return data({ query, results: null, failed: true }, { status: 502 })
  }
}

export default function Search({ loaderData }: Route.ComponentProps) {
  return <SearchResultsPage {...loaderData} />
}
