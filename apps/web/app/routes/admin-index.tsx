import { PERMISSIONS } from '@reprint/shared'
import { redirect } from 'react-router'
import { requireViewerPermission } from '../lib/admin.server.js'
import type { Route } from './+types/admin-index'

/** Until the dashboard (M4-T13) lands, `/admin` opens the review queue. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.reviewsModerate)
  throw redirect('/admin/reviews')
}
