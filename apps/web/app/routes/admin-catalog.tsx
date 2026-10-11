import {
  type AdminBookSearchResponse,
  type AdminCatalogStats,
  APP_NAME,
  adminBookSearchQuerySchema,
  adminBookSearchResponseSchema,
  adminCatalogStatsSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { CatalogDashboard } from '../components/admin/catalog-dashboard.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-catalog'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.catalog.title}`, noindex: true })
}

type Api = ReturnType<typeof apiClientFor>

async function loadStats(api: Api): Promise<AdminCatalogStats> {
  let response: Response
  try {
    response = await api.get('/v1/admin/catalog/stats')
  } catch (error) {
    logger.error({ err: error }, 'could not load the Catalog stats')
    throw data(copy.admin.catalog.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'Catalog stats request failed')
    throw data(copy.admin.catalog.loadFailed, { status: 502 })
  }
  return adminCatalogStatsSchema.parse(await response.json())
}

/** The dashboard's Book search. A failure shows a message in place of results, not an error page. */
async function searchBooks(
  api: Api,
  q: string,
  page: number,
): Promise<AdminBookSearchResponse | 'failed'> {
  let response: Response
  try {
    response = await api.get(`/v1/admin/books?${new URLSearchParams({ q, page: String(page) })}`)
  } catch (error) {
    logger.error({ err: error }, 'could not search the Catalog')
    return 'failed'
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'admin Book search request failed')
    return 'failed'
  }
  return adminBookSearchResponseSchema.parse(await response.json())
}

/**
 * Catalog size and monthly growth from `GET /v1/admin/catalog/stats`, and a search that finds a
 * Book to edit through `GET /v1/admin/books` (PRD §6, §7.11).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  const url = new URL(request.url)
  const query = adminBookSearchQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
  })
  const { q, page } = query.success ? query.data : { q: '', page: 1 }
  const api = apiClientFor(request)
  const [stats, results] = await Promise.all([loadStats(api), q ? searchBooks(api, q, page) : null])
  return { stats, search: { q, page, results } }
}

export default function AdminCatalog({ loaderData }: Route.ComponentProps) {
  return <CatalogDashboard stats={loaderData.stats} search={loaderData.search} />
}
