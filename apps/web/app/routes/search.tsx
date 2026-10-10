import {
  APP_NAME,
  type AuthorSuggestion,
  type GenreNode,
  genreTreeResponseSchema,
  searchResponseSchema,
} from '@reprint/shared'
import { data, redirect, useRouteLoaderData } from 'react-router'
import { SearchResultsPage } from '../components/search/search-results-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { matchAuthor } from '../lib/author-match.js'
import { logger } from '../lib/logger.server.js'
import { isSearchable, parseSearchParams, resolveHref, searchHref } from '../lib/search-links.js'
import { pageMeta } from '../lib/seo.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/search'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${APP_NAME}: ${copy.search.title(args.loaderData?.query.q ?? '')}`,
    noindex: true,
  })
}

/** The Genre select is optional: if the list can't load the filter still works from the URL. */
async function loadGenres(request: Request): Promise<GenreNode[]> {
  try {
    const response = await apiClientFor(request).get('/v1/genres')
    if (!response.ok) return []
    return genreTreeResponseSchema.parse(await response.json()).items
  } catch (error) {
    logger.warn({ err: error }, 'could not load genres for the search filter')
    return []
  }
}

/** The Books tab shows an Author card when the query names an Author; any failure just skips it. */
async function loadAuthorMatch(request: Request, q: string): Promise<AuthorSuggestion | null> {
  try {
    const params = new URLSearchParams({ q, type: 'authors' })
    const response = await apiClientFor(request).get(`/v1/search?${params}`)
    if (!response.ok) return null
    const { items } = searchResponseSchema.parse(await response.json())
    return matchAuthor(
      q,
      items.flatMap((item) => (item.kind === 'author' ? [item.author] : [])),
    )
  } catch (error) {
    logger.warn({ err: error }, 'could not look up an Author match for search')
    return null
  }
}

/** Results come from the API on first load (PRD §7.3); an ISBN with an exact match goes straight to the Book. */
export async function loader({ request }: Route.LoaderArgs) {
  const query = parseSearchParams(new URL(request.url).searchParams)
  const genres = query.type === 'books' ? loadGenres(request) : Promise.resolve([])
  const authorMatch =
    query.type === 'books' && query.page === 1 && isSearchable(query)
      ? loadAuthorMatch(request, query.q)
      : Promise.resolve(null)
  if (!isSearchable(query)) {
    return { query, results: null, failed: false, genres: await genres, authorMatch: null }
  }
  try {
    const [response, genreList, author] = await Promise.all([
      apiClientFor(request).get(
        `/v1/search?${new URL(searchHref(query), 'http://x').searchParams}`,
      ),
      genres,
      authorMatch,
    ])
    if (!response.ok) {
      logger.error({ status: response.status }, 'search failed')
      return data(
        { query, results: null, failed: true, genres: genreList, authorMatch: null },
        { status: 502 },
      )
    }
    const results = searchResponseSchema.parse(await response.json())
    if (results.isbnMatch?.kind === 'book') throw redirect(`/books/${results.isbnMatch.slug}`)
    if (results.isbnMatch?.kind === 'candidate') throw redirect(resolveHref(results.isbnMatch.ref))
    return { query, results, failed: false, genres: genreList, authorMatch: author }
  } catch (error) {
    if (error instanceof Response) throw error
    logger.error({ err: error }, 'could not load search results')
    return data(
      { query, results: null, failed: true, genres: await genres, authorMatch: null },
      { status: 502 },
    )
  }
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return <SearchResultsPage {...loaderData} viewer={session?.viewer ?? null} />
}
