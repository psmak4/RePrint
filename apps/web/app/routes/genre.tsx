import {
  APP_NAME,
  genreBooksQuerySchema,
  genreDetailResponseSchema,
  slugSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { GenrePage } from '../components/books/genre-pages.js'
import { JsonLd } from '../components/seo/json-ld.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { genreBreadcrumbs } from '../lib/json-ld.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/genre'

export function meta(args: Route.MetaArgs) {
  if (!args.loaderData) return [{ title: APP_NAME }]
  const { detail, page } = args.loaderData
  const { name } = detail.genre
  return pageMeta(args, {
    title: `${name} | ${APP_NAME}`,
    description: copy.genres.metaDescription(name),
    keepParams: { page: page > 1 ? String(page) : undefined },
    openGraph: { type: 'website', title: name },
  })
}

/** One page of Books in a Genre, sorted as the URL says (PRD §7.5). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })

  // An unknown sort or page falls back to the defaults rather than failing the page.
  const url = new URL(request.url)
  const parsed = genreBooksQuerySchema.safeParse({
    sort: url.searchParams.get('sort') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
  })
  const query = parsed.success ? parsed.data : genreBooksQuerySchema.parse({})

  let response: Response
  try {
    response = await apiClientFor(request).get(
      `/v1/genres/${slug.data}?sort=${query.sort}&page=${query.page}`,
    )
  } catch (error) {
    logger.error({ err: error }, 'could not load genre')
    throw data(copy.genres.loadFailed, { status: 502 })
  }
  if (response.status === 404) throw data('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'genre request failed')
    throw data(copy.genres.loadFailed, { status: 502 })
  }
  const detail = genreDetailResponseSchema.parse(await response.json())
  return {
    detail,
    sort: query.sort,
    page: query.page,
    jsonLd: genreBreadcrumbs(url.origin, detail),
  }
}

export default function Genre({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <JsonLd data={loaderData.jsonLd} />
      <GenrePage detail={loaderData.detail} sort={loaderData.sort} />
    </>
  )
}
