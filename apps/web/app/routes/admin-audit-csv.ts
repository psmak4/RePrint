import { adminAuditFiltersSchema, PERMISSIONS } from '@reprint/shared'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import type { Route } from './+types/admin-audit-csv'

/** Resource route: streams the API's filtered audit CSV to the browser with its download headers. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.auditView)
  const params = new URL(request.url).searchParams
  const query = new URLSearchParams()
  for (const key of Object.keys(adminAuditFiltersSchema.shape)) {
    const value = params.get(key)?.trim()
    if (value) query.set(key, value)
  }
  const response = await apiClientFor(request).get(`/v1/admin/audit.csv?${query}`)
  if (response.status === 401 || response.status === 403) {
    return new Response('Forbidden', { status: response.status })
  }
  if (!response.ok) return new Response('Could not prepare the audit export.', { status: 502 })
  const headers = new Headers()
  for (const name of ['content-type', 'content-disposition', 'cache-control']) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(response.body, { status: 200, headers })
}
