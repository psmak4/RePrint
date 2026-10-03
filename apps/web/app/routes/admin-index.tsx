import { APP_NAME, type ModStats, modStatsSchema, PERMISSIONS } from '@reprint/shared'
import { data } from 'react-router'
import { ModerationDashboard } from '../components/admin/moderation-dashboard.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-index'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.dashboard.title}`, noindex: true })
}

/** The review queue counts from `GET /v1/mod/stats`. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.reviewsModerate)
  let response: Response
  try {
    response = await apiClientFor(request).get('/v1/mod/stats')
  } catch (error) {
    logger.error({ err: error }, 'could not load the moderation stats')
    throw data(copy.admin.dashboard.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'moderation stats request failed')
    throw data(copy.admin.dashboard.loadFailed, { status: 502 })
  }
  const stats: ModStats = modStatsSchema.parse(await response.json())
  return { stats, now: new Date().toISOString() }
}

export default function AdminIndex({ loaderData }: Route.ComponentProps) {
  return <ModerationDashboard stats={loaderData.stats} now={loaderData.now} />
}
