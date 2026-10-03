import { type AdminSystem, APP_NAME, adminSystemSchema, PERMISSIONS } from '@reprint/shared'
import { data } from 'react-router'
import { SystemDashboard } from '../components/admin/system-dashboard.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-system'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.system.title}`, noindex: true })
}

/** Source usage, search cache, and queue health from `GET /v1/admin/system` (PRD §6). */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.catalogManage)
  let response: Response
  try {
    response = await apiClientFor(request).get('/v1/admin/system')
  } catch (error) {
    logger.error({ err: error }, 'could not load the system numbers')
    throw data(copy.admin.system.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'system request failed')
    throw data(copy.admin.system.loadFailed, { status: 502 })
  }
  const system: AdminSystem = adminSystemSchema.parse(await response.json())
  return { system }
}

export default function AdminSystemPage({ loaderData }: Route.ComponentProps) {
  return <SystemDashboard system={loaderData.system} />
}
