import {
  APP_NAME,
  type ClaimReviewResponse,
  claimReviewResponseSchema,
  type ModQueueResponse,
  modQueueResponseSchema,
  PERMISSIONS,
  reviewIdParamsSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { ReviewQueue } from '../components/admin/review-queue.js'
import { copy } from '../copy/index.js'
import { requireViewerPermission } from '../lib/admin.server.js'
import { apiClientFor } from '../lib/api.server.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/admin-reviews'

const QUEUE_PAGE_SIZE = 20

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.admin.reviews.title}` },
    { name: 'robots', content: 'noindex' },
  ]
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
