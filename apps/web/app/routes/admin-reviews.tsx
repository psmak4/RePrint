import {
  APP_NAME,
  type ClaimReviewResponse,
  claimReviewResponseSchema,
  type ModQueueResponse,
  modQueueResponseSchema,
  PERMISSIONS,
  REVIEW_DECISION_REASON_MAX,
  reviewDecisionResponseSchema,
  reviewIdParamsSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { z } from 'zod'
import { ReviewQueue } from '../components/admin/review-queue.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { logger } from '../lib/logger.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/admin-reviews'

const QUEUE_PAGE_SIZE = 20

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.admin.reviews.title}`, noindex: true })
}

export type ClaimState =
  | { state: 'mine'; expiresAt: string }
  | { state: 'other'; name: string | null }
  | { state: 'failed' }

/**
 * The Pending queue (oldest first) and, when `?review=<id>` names an item in it, that item with a
 * claim taken for the viewer (PRD §7.10). Opening a review is what claims it (D-126).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireViewerPermission(request, PERMISSIONS.reviewsModerate)
  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor') || null
  const reviewId = reviewIdParamsSchema.safeParse({ id: url.searchParams.get('review') })
  const api = apiClientFor(request)

  const query = new URLSearchParams({ limit: String(QUEUE_PAGE_SIZE) })
  if (cursor) query.set('cursor', cursor)
  let response: Response
  try {
    response = await api.get(`/v1/mod/reviews?${query}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load the review queue')
    throw data(copy.admin.reviews.loadFailed, { status: 502 })
  }
  if (response.status === 401 || response.status === 403) {
    throw data('Forbidden', { status: response.status })
  }
  if (!response.ok) {
    logger.error({ status: response.status }, 'review queue request failed')
    throw data(copy.admin.reviews.loadFailed, { status: 502 })
  }
  const queue: ModQueueResponse = modQueueResponseSchema.parse(await response.json())

  const selected = reviewId.success
    ? (queue.items.find((item) => item.id === reviewId.data.id) ?? null)
    : null
  const requested = reviewId.success
  let claim: ClaimState | null = null
  if (selected) {
    if (selected.claim && !selected.claim.mine) {
      claim = { state: 'other', name: selected.claim.moderator.displayName }
    } else {
      claim = await claimReview(api, selected.id)
    }
  }
  return { queue, selected, requested, claim, cursor, now: new Date().toISOString() }
}

const decisionActionSchema = z.object({
  intent: z.enum(['approve', 'reject']),
  reviewId: z.uuid(),
  reason: z.string().trim().max(REVIEW_DECISION_REASON_MAX).optional(),
})

/** Approve or reject the opened review. The API checks the claim and writes the audit row (D-122). */
export async function action({ request }: Route.ActionArgs) {
  await requireViewerPermission(request, PERMISSIONS.reviewsModerate)
  const parsed = decisionActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return data({ formError: copy.admin.reviews.decideFailed }, { status: 400 })
  }
  const { intent, reviewId, reason } = parsed.data
  // The API takes a JSON body even without a reason.
  const result = await sendToApi(
    request,
    'POST',
    `/v1/mod/reviews/${reviewId}/${intent}`,
    reason ? { reason } : {},
    copy.admin.reviews.decideFailed,
  )
  if (!result.ok) return failed(result)
  const { status } = reviewDecisionResponseSchema.parse(result.body)
  return { decided: status, reviewId }
}

async function claimReview(api: ReturnType<typeof apiClientFor>, id: string): Promise<ClaimState> {
  try {
    const response = await api.request(`/v1/mod/reviews/${id}/claim`, { method: 'POST' })
    if (response.ok) {
      const body: ClaimReviewResponse = claimReviewResponseSchema.parse(await response.json())
      return { state: 'mine', expiresAt: body.expiresAt }
    }
    if (response.status === 409) return { state: 'other', name: null }
  } catch (error) {
    logger.error({ err: error }, 'could not claim the review')
  }
  return { state: 'failed' }
}

export default function AdminReviews({ loaderData }: Route.ComponentProps) {
  return <ReviewQueue {...loaderData} />
}
