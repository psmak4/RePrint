import {
  type AdminAuditResponse,
  APP_NAME,
  adminAuditFiltersSchema,
  adminAuditQuerySchema,
  adminAuditResponseSchema,
  PERMISSIONS,
} from '@reprint/shared'
import { data } from 'react-router'
import { AuditLog } from '../components/admin/audit-log.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-audit'

const PAGE_SIZE = 25
const FILTERS = Object.keys(
  adminAuditFiltersSchema.shape,
) as (keyof typeof adminAuditFiltersSchema.shape)[]

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.audit.title}`, noindex: true })
}

/** The audit log, newest first, filtered by the URL (PRD §7.11). Empty or invalid filters are dropped. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.auditView)
  const params = new URL(request.url).searchParams
  const raw: Record<string, string> = {}
  for (const key of [...FILTERS, 'cursor']) {
    const value = params.get(key)?.trim()
    if (value) raw[key] = value
  }
  const checked = adminAuditQuerySchema.safeParse({ ...raw, limit: PAGE_SIZE })
  // A bad value (an unknown action, a malformed date) is shown as no filter rather than an error page.
  const parsed = checked.success ? checked.data : adminAuditQuerySchema.parse({ limit: PAGE_SIZE })
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
  for (const key of [...FILTERS, 'cursor'] as const) {
    const value = parsed[key]
    if (value) query.set(key, value)
  }
  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/admin/audit?${query}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load the audit log')
    throw data(copy.admin.audit.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'audit log request failed')
    throw data(copy.admin.audit.loadFailed, { status: 502 })
  }
  const entries: AdminAuditResponse = adminAuditResponseSchema.parse(await response.json())
  const filters = Object.fromEntries(FILTERS.map((key) => [key, parsed[key] ?? ''])) as Record<
    (typeof FILTERS)[number],
    string
  >
  return { entries, filters }
}

export default function AdminAudit({ loaderData }: Route.ComponentProps) {
  return <AuditLog {...loaderData} />
}
