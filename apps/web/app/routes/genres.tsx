import { APP_NAME, genreTreeResponseSchema } from '@reprint/shared'
import { data } from 'react-router'
import { GenresIndexPage } from '../components/books/genre-pages.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/genres'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.genres.indexTitle} | ${APP_NAME}`,
    description: copy.genres.indexMetaDescription,
  })
}

/** The Genre tree, loaded on the server (PRD §7.5). */
export async function loader({ request }: Route.LoaderArgs) {
  let response: Response
  try {
    response = await apiClientFor(request).get('/v1/genres')
  } catch (error) {
    logger.error({ err: error }, 'could not load genres')
    throw data(copy.genres.loadFailed, { status: 502 })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'genres request failed')
    throw data(copy.genres.loadFailed, { status: 502 })
  }
  return genreTreeResponseSchema.parse(await response.json())
}

export default function Genres({ loaderData }: Route.ComponentProps) {
  return <GenresIndexPage items={loaderData.items} />
}
