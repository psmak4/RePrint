import { APP_NAME, libraryQuerySchema, libraryResponseSchema } from '@reprint/shared'
import { data, useRouteLoaderData } from 'react-router'
import { LibraryPage, PrivateLibrary } from '../components/library/library-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/library'

export function meta({ params }: Route.MetaArgs) {
  const username = params.username ?? ''
  return [
    { title: `${copy.library.title(username)} | ${APP_NAME}` },
    { name: 'description', content: copy.library.metaDescription(username) },
    { name: 'robots', content: 'noindex' },
  ]
}

/** A Member's Library, loaded on the server; sort, Shelf, and page come from the URL (PRD §7.7). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const username = params.username
  if (!username) throw data('Not found', { status: 404 })

  // An unknown sort, Shelf, or page falls back to the defaults rather than failing the page.
  const url = new URL(request.url)
  const parsed = libraryQuerySchema.safeParse({
    shelf: url.searchParams.get('shelf') ?? undefined,
    sort: url.searchParams.get('sort') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
  })
  const query = parsed.success ? parsed.data : libraryQuerySchema.parse({})

  const search = new URLSearchParams({ sort: query.sort, page: String(query.page) })
  if (query.shelf) search.set('shelf', query.shelf)

  let response: Response
  try {
    response = await apiClientFor(request).get(
      `/v1/users/${encodeURIComponent(username)}/library?${search}`,
    )
  } catch (error) {
    logger.error({ err: error }, 'could not load library')
    throw data(copy.library.loadFailed, { status: 502 })
  }
  // A private Library and an unknown account look the same (D-141).
  if (response.status === 404) {
    return data(
      { username, library: null, view: { shelf: query.shelf, sort: query.sort, page: query.page } },
      { status: 404 },
    )
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'library request failed')
    throw data(copy.library.loadFailed, { status: 502 })
  }
  return {
    username,
    library: libraryResponseSchema.parse(await response.json()),
    view: { shelf: query.shelf, sort: query.sort, page: query.page },
  }
}

export default function Library({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  if (loaderData.library === null) return <PrivateLibrary />
  return (
    <LibraryPage
      username={loaderData.username}
      library={loaderData.library}
      view={loaderData.view}
      viewer={session?.viewer ?? null}
    />
  )
}
