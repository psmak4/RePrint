import {
  type AdminUserDetail,
  APP_NAME,
  adminUserDetailSchema,
  adminUserResendVerificationResponseSchema,
  adminUserRevokeSessionsResponseSchema,
  adminUserRolesResponseSchema,
  assignableRoleSchema,
  PERMISSIONS,
  suspendUserRequestSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { UserDetail } from '../components/admin/user-detail.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-user'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.users.title}`, noindex: true })
}

/** One user with what the viewer may do to them (PRD §7.11). Moderators get the limited view (D-044). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.usersView)
  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/admin/users/${encodeURIComponent(params.id)}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load the admin user')
    throw data(copy.admin.users.loadFailed, { status: 502 })
  }
  if (response.status === 404 || response.status === 400) {
    throw data('Not found', { status: 404 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'admin user request failed')
    throw data(copy.admin.users.loadFailed, { status: 502 })
  }
  const detail: AdminUserDetail = adminUserDetailSchema.parse(await response.json())
  return {
    detail,
    now: new Date().toISOString(),
    canAssign: viewer.permissions.includes(PERMISSIONS.rolesAssign),
    canSuspend: viewer.permissions.includes(PERMISSIONS.usersSuspend),
  }
}

const userActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('grant'), role: assignableRoleSchema }),
  z.object({ intent: z.literal('revoke'), role: assignableRoleSchema }),
  z.object({
    intent: z.literal('suspend'),
    reason: suspendUserRequestSchema.shape.reason,
    until: z.string().optional(),
  }),
  z.object({ intent: z.literal('unsuspend') }),
  z.object({ intent: z.literal('revoke-sessions') }),
  z.object({ intent: z.literal('resend-verification') }),
])

/** Each action is one permission-checked, audited API call; the buttons are hidden without the permission. */
export async function action({ request, params }: Route.ActionArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.usersView)
  const parsed = userActionSchema.safeParse(await request.json().catch(() => null))
  const fallback = copy.admin.users.actions.failed
  if (!parsed.success) return data({ formError: fallback }, { status: 400 })
  const input = parsed.data
  const base = `/v1/admin/users/${encodeURIComponent(params.id)}`
  const can = (permission: string) => viewer.permissions.includes(permission)

  if (input.intent === 'grant' || input.intent === 'revoke') {
    if (!can(PERMISSIONS.rolesAssign)) throw data('Forbidden', { status: 403 })
    const result = await sendToApi(
      request,
      input.intent === 'grant' ? 'PUT' : 'DELETE',
      `${base}/roles/${input.role}`,
      null,
      fallback,
    )
    if (!result.ok) return failed(result)
    const body = adminUserRolesResponseSchema.parse(result.body)
    return { done: input.intent, changed: body.changed }
  }
  if (input.intent === 'resend-verification') {
    const result = await sendToApi(request, 'POST', `${base}/resend-verification`, {}, fallback)
    if (!result.ok) return failed(result)
    const body = adminUserResendVerificationResponseSchema.parse(result.body)
    return { done: 'resent' as const, sent: body.sent }
  }
  if (!can(PERMISSIONS.usersSuspend)) throw data('Forbidden', { status: 403 })
  if (input.intent === 'unsuspend') {
    const result = await sendToApi(request, 'POST', `${base}/unsuspend`, {}, fallback)
    if (!result.ok) return failed(result)
    return { done: 'unsuspended' as const }
  }
  if (input.intent === 'revoke-sessions') {
    const result = await sendToApi(request, 'POST', `${base}/revoke-sessions`, {}, fallback)
    if (!result.ok) return failed(result)
    return {
      done: 'sessions' as const,
      revoked: adminUserRevokeSessionsResponseSchema.parse(result.body).revoked,
    }
  }
  // A date-only value from the form means the end of that day, UTC.
  const until = input.until ? new Date(`${input.until}T23:59:59Z`) : null
  if (until && Number.isNaN(until.getTime())) return data({ formError: fallback }, { status: 400 })
  const result = await sendToApi(
    request,
    'POST',
    `${base}/suspend`,
    { reason: input.reason, ...(until ? { until: until.toISOString() } : {}) },
    fallback,
  )
  if (!result.ok) return failed(result)
  return { done: 'suspended' as const }
}

export default function AdminUser({ loaderData }: Route.ComponentProps) {
  return <UserDetail {...loaderData} />
}
