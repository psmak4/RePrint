import { sitemapChunkSchema, sitemapIndexSchema } from '@reprint/shared'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { renderSitemapChunk, renderSitemapIndex } from '../lib/sitemap.js'
import type { Route } from './+types/sitemap'

const XML_HEADERS = {
  'content-type': 'application/xml; charset=utf-8',
  'cache-control': 'public, max-age=3600',
}

/** Resource route: `/sitemap.xml` (the index) and `/sitemaps/:number.xml` (one chunk), from the API's nightly build. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const origin = new URL(request.url).origin
  const chunk = params.chunk
  const match = chunk === undefined ? null : /^([1-9]\d*)\.xml$/.exec(chunk)
  if (chunk !== undefined && !match) return new Response('Not found', { status: 404 })

  let response: Response
  try {
    response = await apiClientFor(request).get(match ? `/v1/sitemaps/${match[1]}` : '/v1/sitemaps')
  } catch (error) {
    logger.error({ err: error }, 'could not load the sitemap')
    return new Response('The sitemap is unavailable.', { status: 502 })
  }
  if (response.status === 404) return new Response('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'sitemap request failed')
    return new Response('The sitemap is unavailable.', { status: 502 })
  }
  const body = await response.json()
  const xml = match
    ? renderSitemapChunk(origin, sitemapChunkSchema.parse(body))
    : renderSitemapIndex(origin, sitemapIndexSchema.parse(body))
  return new Response(xml, { headers: XML_HEADERS })
}
