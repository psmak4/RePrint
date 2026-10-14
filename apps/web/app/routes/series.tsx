import { APP_NAME, seriesDetailResponseSchema, slugSchema } from '@reprint/shared'
import { data, useRouteLoaderData } from 'react-router'
import { SeriesPage } from '../components/books/series-page.js'
import { JsonLd } from '../components/seo/json-ld.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { seriesBreadcrumbs } from '../lib/json-ld.js'
import { logger } from '../lib/logger.server.js'
import { toRichTree } from '../lib/rich-text.server.js'
import { pageMeta } from '../lib/seo.js'
import type { loader as rootLoader } from '../root.js'
import type { Route } from './+types/series'

export function meta(args: Route.MetaArgs) {
  if (!args.loaderData) return [{ title: APP_NAME }]
  const { name } = args.loaderData.series
  return pageMeta(args, {
    title: `${name} | ${APP_NAME}`,
    description: copy.series.metaDescription(name),
    openGraph: { type: 'website', title: name },
  })
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
  const detail = seriesDetailResponseSchema.parse(await response.json())
  return {
    ...detail,
    // Parsed here, so the page draws it without a Markdown parser (M10-T08).
    descriptionTree: detail.series.description
      ? toRichTree(detail.series.description, { inline: true })
      : null,
    jsonLd: seriesBreadcrumbs(new URL(request.url).origin, detail),
  }
}

export default function Series({ loaderData }: Route.ComponentProps) {
  const session = useRouteLoaderData<typeof rootLoader>('root')
  return (
    <>
      <JsonLd data={loaderData.jsonLd} />
      <SeriesPage
        detail={loaderData}
        descriptionTree={loaderData.descriptionTree}
        viewer={session?.viewer ?? null}
      />
    </>
  )
}
