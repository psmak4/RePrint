import {
  APP_NAME,
  type ModReportsResponse,
  modReportsResponseSchema,
  PERMISSIONS,
  REVIEW_DECISION_REASON_MAX,
  reportDismissResponseSchema,
  reviewUnpublishResponseSchema,
  suspendUserRequestSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { ReportsQueue } from '../components/admin/reports-queue.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-reports'

const QUEUE_PAGE_SIZE = 20

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.reports.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** The Reports queue (reviews with open reports, oldest first) and what the viewer may do (PRD §7.10). */
export async function loader({ request }: Route.LoaderArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.reportsResolve)
  const cursor = new URL(request.url).searchParams.get('cursor') || null
  const query = new URLSearchParams({ limit: String(QUEUE_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  let response: Response
  try {
    response = await apiClientFor(request).get(`/v1/mod/reports?${query}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load the reports queue')
    throw data(copy.admin.reports.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'reports queue request failed')
    throw data(copy.admin.reports.loadFailed, { status: 502 })
  }
  const queue: ModReportsResponse = modReportsResponseSchema.parse(await response.json())
  return {
    queue,
    cursor,
    now: new Date().toISOString(),
    // Unpublish needs `reviews.moderate` and suspending needs `users.suspend` (Admins only).
    canUnpublish: viewer.permissions.includes(PERMISSIONS.reviewsModerate),
    canSuspend: viewer.permissions.includes(PERMISSIONS.usersSuspend),
  }
}

const reportActionSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('dismiss'), reviewId: z.uuid() }),
  z.object({
    intent: z.literal('unpublish'),
    reviewId: z.uuid(),
    reason: z.string().trim().min(1).max(REVIEW_DECISION_REASON_MAX),
  }),
  z.object({
    intent: z.literal('suspend'),
    reviewId: z.uuid(),
    userId: z.uuid(),
    reason: suspendUserRequestSchema.shape.reason,
    until: z.string().optional(),
  }),
])

/** Dismiss, unpublish, or suspend the author. Each is a permission-checked, audited API call. */
export async function action({ request }: Route.ActionArgs) {
  const viewer = await requireViewerPermission(request, PERMISSIONS.reportsResolve)
  const parsed = reportActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return data({ formError: copy.admin.reports.actionFailed }, { status: 400 })
  }
  const input = parsed.data
  const fallback = copy.admin.reports.actionFailed

  if (input.intent === 'dismiss') {
    const result = await sendToApi(
      request,
      'POST',
      `/v1/mod/reports/${input.reviewId}/dismiss`,
      {},
      fallback,
    )
    if (!result.ok) return failed(result)
    reportDismissResponseSchema.parse(result.body)
    return { done: 'dismissed' as const, reviewId: input.reviewId }
  }
  if (input.intent === 'unpublish') {
    if (!viewer.permissions.includes(PERMISSIONS.reviewsModerate)) {
      throw data('Forbidden', { status: 403 })
    }
    const result = await sendToApi(
      request,
      'POST',
      `/v1/mod/reviews/${input.reviewId}/unpublish`,
      { reason: input.reason },
      fallback,
    )
    if (!result.ok) return failed(result)
    reviewUnpublishResponseSchema.parse(result.body)
    return { done: 'unpublished' as const, reviewId: input.reviewId }
  }
  if (!viewer.permissions.includes(PERMISSIONS.usersSuspend)) {
    throw data('Forbidden', { status: 403 })
  }
  // A date-only value from the form means the end of that day, UTC.
  const until = input.until ? new Date(`${input.until}T23:59:59Z`) : null
  if (until && Number.isNaN(until.getTime())) {
    return data({ formError: fallback }, { status: 400 })
  }
  const result = await sendToApi(
    request,
    'POST',
    `/v1/admin/users/${input.userId}/suspend`,
    { reason: input.reason, ...(until ? { until: until.toISOString() } : {}) },
    fallback,
  )
  if (!result.ok) return failed(result)
  return { done: 'suspended' as const, reviewId: input.reviewId }
}

export default function AdminReports({ loaderData }: Route.ComponentProps) {
  return <ReportsQueue {...loaderData} />
}
