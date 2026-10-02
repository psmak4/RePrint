import {
  type AdminCatalogStats,
  APP_NAME,
  adminCatalogStatsSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { CatalogDashboard } from '../components/admin/catalog-dashboard.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-catalog'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.catalog.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** Catalog size and monthly growth from `GET /v1/admin/catalog/stats` (PRD §6, §7.11). */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  let response: Response
  try {
    response = await apiClientFor(request).get('/v1/admin/catalog/stats')
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
  const stats: AdminCatalogStats = adminCatalogStatsSchema.parse(await response.json())
  return { stats }
}

export default function AdminCatalog({ loaderData }: Route.ComponentProps) {
  return <CatalogDashboard stats={loaderData.stats} />
}
