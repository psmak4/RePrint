import {
  type AdminUsersResponse,
  APP_NAME,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { UsersList } from '../components/admin/users-list.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-users'

const PAGE_SIZE = 25
const FILTERS = ['q', 'role', 'status', 'joinedFrom', 'joinedTo'] as const

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.users.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** Users, newest first, searched and filtered by the URL (PRD §7.11). Empty or invalid filters are dropped. */
export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.usersView)
  const params = new URL(request.url).searchParams
  const raw: Record<string, string> = {}
  for (const key of [...FILTERS, 'cursor']) {
    const value = params.get(key)?.trim()
    if (value) raw[key] = value
  }
  const filters = adminUsersQuerySchema.safeParse({ ...raw, limit: PAGE_SIZE })
  // A bad value (an unknown role, a malformed date) is shown as no filter rather than an error page.
  const parsed = filters.success
    ? filters.data
    : { ...adminUsersQuerySchema.parse({ limit: PAGE_SIZE }) }
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
  for (const key of [...FILTERS, 'cursor'] as const) {
    const value = parsed[key]
    if (value) query.set(key, value)
  }
  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/admin/users?${query}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load admin users')
    throw data(copy.admin.users.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'admin users request failed')
    throw data(copy.admin.users.loadFailed, { status: 502 })
  }
  const users: AdminUsersResponse = adminUsersResponseSchema.parse(await response.json())
  const filterValues = Object.fromEntries(FILTERS.map((key) => [key, parsed[key] ?? ''])) as Record<
    (typeof FILTERS)[number],
    string
  >
  return {
    users,
    filters: filterValues,
    // Only the full view can search by email (D-149).
    canSearchEmail: viewer.permissions.includes(PERMISSIONS.auditView),
  }
}

export default function AdminUsers({ loaderData }: Route.ComponentProps) {
  return <UsersList {...loaderData} />
}
