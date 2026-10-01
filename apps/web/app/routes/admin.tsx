import { APP_NAME, PERMISSIONS } from '@reprint/shared'
import { AdminLayout, type AdminNavItem } from '../components/admin/admin-layout.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import type { Route } from './+types/admin'

/** Holding any of these opens the admin area; each page then checks its own permission. */
const ADMIN_AREA_PERMISSIONS = [
  PERMISSIONS.reviewsModerate,
  PERMISSIONS.reportsResolve,
  PERMISSIONS.usersView,
  PERMISSIONS.auditView,
]

export function meta() {
  return [{ title: `${APP_NAME}: ${copy.admin.title}` }, { name: 'robots', content: 'noindex' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, ADMIN_AREA_PERMISSIONS)
  const items: AdminNavItem[] = []
  if (viewer.permissions.includes(PERMISSIONS.reviewsModerate)) {
    items.push({ to: '/admin/reviews', label: copy.admin.reviewsNav })
  }
  return { items }
}

export default function Admin({ loaderData }: Route.ComponentProps) {
  return <AdminLayout items={loaderData.items} />
}
