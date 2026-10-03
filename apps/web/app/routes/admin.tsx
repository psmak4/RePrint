import { APP_NAME, PERMISSIONS } from '@reprint/shared'
import { AdminLayout, type AdminNavItem } from '../components/admin/admin-layout.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
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

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, ADMIN_AREA_PERMISSIONS)
  const items: AdminNavItem[] = []
  if (viewer.permissions.includes(PERMISSIONS.reviewsModerate)) {
    items.push({ to: '/admin', label: copy.admin.dashboardNav })
    items.push({ to: '/admin/reviews', label: copy.admin.reviewsNav })
  }
  if (viewer.permissions.includes(PERMISSIONS.reportsResolve)) {
    items.push({ to: '/admin/reports', label: copy.admin.reportsNav })
  }
  if (viewer.permissions.includes(PERMISSIONS.usersView)) {
    items.push({ to: '/admin/users', label: copy.admin.usersNav })
  }
  if (viewer.permissions.includes(PERMISSIONS.auditView)) {
    items.push({ to: '/admin/audit', label: copy.admin.auditNav })
  }
  if (viewer.permissions.includes(PERMISSIONS.catalogManage)) {
    items.push({ to: '/admin/catalog', label: copy.admin.catalogNav })
    items.push({ to: '/admin/catalog/merge', label: copy.admin.mergeNav })
    items.push({ to: '/admin/catalog/genres', label: copy.admin.genresNav })
  }
  if (viewer.permissions.includes(PERMISSIONS.featuredManage)) {
    items.push({ to: '/admin/featured', label: copy.admin.featuredNav })
  }
  return { items }
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  return <AdminLayout items={loaderData.items} />
}
