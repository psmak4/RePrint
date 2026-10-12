import { Outlet } from 'react-router'
import type { AdminNavGroup } from './admin-page.js'

/** `/admin/*`: hands the grouped nav to each page, which renders its own `AdminPage` (D-201). */
export function AdminLayout({ groups }: { groups: AdminNavGroup[] }) {
  return <Outlet context={groups} />
}
