import { APP_NAME, type ModStats, modStatsSchema, PERMISSIONS } from '@reprint/shared'
import { AdminLayout } from '../components/admin/admin-layout.js'
import type { AdminNavGroup, AdminNavItem } from '../components/admin/admin-page.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin'

/** Holding any of these opens the admin area; each page then checks its own permission. */
const ADMIN_AREA_PERMISSIONS = [
  PERMISSIONS.reviewsModerate,
  PERMISSIONS.reportsResolve,
  PERMISSIONS.usersView,
  PERMISSIONS.auditView,
  PERMISSIONS.catalogManage,
  PERMISSIONS.featuredManage,
]

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.title}`, noindex: true })
}

/** How long every admin page waits for the queue counts before showing the page without them. */
export const STATS_TIMEOUT_MS = 2000

/**
 * The moderation stats (the nav counts and the dashboard's numbers), or null when the API did not
 * answer in time; a missing count never fails a page.
 */
async function loadStats(request: Request): Promise<ModStats | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATS_TIMEOUT_MS)
  try {
    const response = await apiClientFor(request).get('/v1/mod/stats', {
      signal: controller.signal,
    })
    if (!response.ok) return null
    const stats = modStatsSchema.safeParse(await response.json())
    return stats.success ? stats.data : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load the moderation stats')
    return null
  } finally {
    clearTimeout(timer)
  }
}

function navItem(
  to: string,
  label: string,
  icon: AdminNavItem['icon'],
  count?: number,
): AdminNavItem {
  return count === undefined ? { to, label, icon } : { to, label, icon, count }
}

/** The grouped nav (D-201): only the sections the viewer may open, with queue counts for moderators. */
export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, ADMIN_AREA_PERMISSIONS)
  const can = (permission: string) => viewer.permissions.includes(permission)
  // `/mod/stats` needs reviews.moderate; anyone else gets no counts rather than a 403.
  const stats = can(PERMISSIONS.reviewsModerate) ? await loadStats(request) : null
  const counts = stats ? { reviews: stats.pendingCount, reports: stats.openReportCount } : null

  const moderation: AdminNavItem[] = []
  if (can(PERMISSIONS.reviewsModerate)) {
    moderation.push(navItem('/admin', copy.admin.dashboardNav, 'dashboard'))
    moderation.push(navItem('/admin/reviews', copy.admin.reviewsNav, 'reviews', counts?.reviews))
  }
  if (can(PERMISSIONS.reportsResolve)) {
    moderation.push(navItem('/admin/reports', copy.admin.reportsNav, 'reports', counts?.reports))
  }
  const people: AdminNavItem[] = []
  if (can(PERMISSIONS.usersView)) people.push(navItem('/admin/users', copy.admin.usersNav, 'users'))
  if (can(PERMISSIONS.auditView)) people.push(navItem('/admin/audit', copy.admin.auditNav, 'audit'))
  const catalog: AdminNavItem[] = []
  if (can(PERMISSIONS.catalogManage)) {
    catalog.push(navItem('/admin/catalog', copy.admin.catalogNav, 'catalog'))
    catalog.push(navItem('/admin/catalog/merge', copy.admin.mergeNav, 'merge'))
    catalog.push(navItem('/admin/catalog/genres', copy.admin.genresNav, 'genres'))
  }
  if (can(PERMISSIONS.featuredManage)) {
    catalog.push(navItem('/admin/featured', copy.admin.featuredNav, 'featured'))
  }
  const operations: AdminNavItem[] = []
  if (can(PERMISSIONS.catalogManage)) {
    operations.push(navItem('/admin/system', copy.admin.systemNav, 'system'))
  }
  const groups: AdminNavGroup[] = [
    { label: copy.admin.navGroups.moderation, items: moderation },
    { label: copy.admin.navGroups.people, items: people },
    { label: copy.admin.navGroups.catalog, items: catalog },
    { label: copy.admin.navGroups.operations, items: operations },
  ].filter((group) => group.items.length > 0)
  // The dashboard reads `stats` from here rather than asking the API a second time.
  return { groups, stats }
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  return <AdminLayout groups={loaderData.groups} />
}
