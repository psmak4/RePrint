import { APP_NAME, seriesDetailResponseSchema, slugSchema } from '@reprint/shared'
import { data, useRouteLoaderData } from 'react-router'
import { SeriesPage } from '../components/books/series-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/series'

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: APP_NAME }]
  const { name } = loaderData.series
  return [
    { title: `${name} | ${APP_NAME}` },
    { name: 'description', content: copy.series.metaDescription(name) },
  ]
}

/** A Series and its Books in reading order, loaded on the server (PRD §7.5). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })

  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/series/${slug.data}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load series')
    throw data(copy.series.loadFailed, { status: 502 })
  }
  if (response.status === 404) throw data('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'series request failed')
    throw data(copy.series.loadFailed, { status: 502 })
  }
  return seriesDetailResponseSchema.parse(await response.json())
}

export default function Series({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return <SeriesPage detail={loaderData} viewer={session?.viewer ?? null} />
}
