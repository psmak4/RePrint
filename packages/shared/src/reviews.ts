import { z } from 'zod'
import { cursorPageOf, MAX_PAGE_SIZE, pageOf } from './pagination.js'

/** Review status (PRD §5.3). */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'unpublished'] as const
export const reviewStatusSchema = z.enum(REVIEW_STATUSES)
export type ReviewStatus = z.infer<typeof reviewStatusSchema>

export const REVIEW_RATING_MIN = 1
export const REVIEW_RATING_MAX = 5
export const REVIEW_HEADLINE_MAX = 120
export const REVIEW_BODY_MIN = 50
export const REVIEW_BODY_MAX = 10_000

/** What a Member submits when writing or editing a Review (PRD §7.6). */
export const reviewInputSchema = z.object({
  rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
  headline: z.string().trim().max(REVIEW_HEADLINE_MAX).optional(),
  body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX),
  hasSpoilers: z.boolean(),
  /** The Edition the Member read, if they said. */
  editionId: z.uuid().optional(),
})
export type ReviewInput = z.infer<typeof reviewInputSchema>

/** What happens to a Review (PRD §7.6, §7.10). */
export const REVIEW_ACTIONS = ['submit', 'edit', 'approve', 'reject', 'unpublish'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

/**
 * The status a Review moves to for an action, or `null` when the PRD does not allow it.
 * `from` is `null` for a Review that does not exist yet. Submitting creates a Pending Review;
 * editing always sends a Review back to Pending (so an Approved one is hidden until approved
 * again); only a Pending Review is decided; only an Approved one is unpublished.
 */
export function nextReviewStatus(
  from: ReviewStatus | null,
  action: ReviewAction,
): ReviewStatus | null {
  switch (action) {
    case 'submit':
      return from === null ? 'pending' : null
    case 'edit':
      return from === null ? null : 'pending'
    case 'approve':
      return from === 'pending' ? 'approved' : null
    case 'reject':
      return from === 'pending' ? 'rejected' : null
    case 'unpublish':
      return from === 'approved' ? 'unpublished' : null
  }
}

/** Whether a Review may move directly from one status to another (PRD §7.6). */
export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_ACTIONS.some((action) => nextReviewStatus(from, action) === to)
}

/** The viewer's own Review of a Book, as `GET/PUT /books/:slug/my-review` return it (PRD §7.6). */
export const myReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
  headline: z.string().nullable(),
  body: z.string(),
  hasSpoilers: z.boolean(),
  editionId: z.uuid().nullable(),
  status: reviewStatusSchema,
  /** The Moderator's reason, shown to the author only while the Review is Rejected. */
  rejectionReason: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type MyReview = z.infer<typeof myReviewSchema>

/** `DELETE /books/:slug/my-review`: deleting is permanent (PRD §7.6). */
export const deleteMyReviewResponseSchema = z.object({ status: z.literal('review_deleted') })

/** Reviews on a Book page: 10 per page (PRD §7.4). */
export const BOOK_REVIEWS_PAGE_SIZE = 10
export const REVIEW_SORTS = ['most_helpful', 'newest', 'highest', 'lowest'] as const
export const reviewSortSchema = z.enum(REVIEW_SORTS)
export type ReviewSort = z.infer<typeof reviewSortSchema>

/** `GET /books/:slug/reviews?sort=&rating=&page=`; most helpful is the default (PRD §7.4). */
export const bookReviewsQuerySchema = z.object({
  sort: reviewSortSchema.default('most_helpful'),
  rating: z.coerce.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(BOOK_REVIEWS_PAGE_SIZE),
})
export type BookReviewsQuery = z.infer<typeof bookReviewsQuerySchema>

/** An Approved Review as readers see it (PRD §7.4, §7.6). */
export const publicReviewSchema = z.object({
  id: z.uuid(),
  rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
  headline: z.string().nullable(),
  body: z.string(),
  hasSpoilers: z.boolean(),
  helpfulCount: z.number().int().min(0),
  submittedAt: z.iso.datetime(),
  author: z.object({ username: z.string(), displayName: z.string() }),
})
export type PublicReview = z.infer<typeof publicReviewSchema>

export const bookReviewsResponseSchema = pageOf(publicReviewSchema)
export type BookReviewsResponse = z.infer<typeof bookReviewsResponseSchema>

/** A Moderator's claim on a queue item lasts this long (PRD §7.10). */
export const REVIEW_CLAIM_MINUTES = 10

export const reviewIdParamsSchema = z.object({ id: z.uuid() })

/** The content of one version of a Review, as the queue's side-by-side comparison shows it. */
export const reviewContentSchema = z.object({
  rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
  headline: z.string().nullable(),
  body: z.string(),
  hasSpoilers: z.boolean(),
})

/** One Pending Review in the moderation queue (PRD §7.10). */
export const modQueueItemSchema = z.object({
  id: z.uuid(),
  book: z.object({ slug: z.string(), title: z.string() }),
  reviewer: z.object({
    username: z.string(),
    displayName: z.string(),
    /** Decisions on this Member's Review versions, plus open reports (0 until M7). */
    approvedCount: z.number().int().min(0),
    rejectedCount: z.number().int().min(0),
    reportedCount: z.number().int().min(0),
  }),
  ...reviewContentSchema.shape,
  editionId: z.uuid().nullable(),
  /** 1 for a first submission, higher for an edit. */
  version: z.number().int().min(1),
  submittedAt: z.iso.datetime(),
  /** The last approved version, for an edited Review that was approved before; else `null`. */
  lastApproved: reviewContentSchema.extend({ decidedAt: z.iso.datetime().nullable() }).nullable(),
  /** An unexpired claim, if any; `mine` tells the viewer whether it is theirs. */
  claim: z
    .object({
      expiresAt: z.iso.datetime(),
      mine: z.boolean(),
      moderator: z.object({ username: z.string(), displayName: z.string() }),
    })
    .nullable(),
})
export type ModQueueItem = z.infer<typeof modQueueItemSchema>

export const modQueueResponseSchema = cursorPageOf(modQueueItemSchema)
export type ModQueueResponse = z.infer<typeof modQueueResponseSchema>

export const claimReviewResponseSchema = z.object({
  reviewId: z.uuid(),
  expiresAt: z.iso.datetime(),
})
export type ClaimReviewResponse = z.infer<typeof claimReviewResponseSchema>

/** The longest reason a Moderator can give with a decision. */
export const REVIEW_DECISION_REASON_MAX = 500

/** `POST /mod/reviews/:id/approve` and `/reject`; the reason is optional (PRD §7.10). */
export const reviewDecisionRequestSchema = z
  .object({ reason: z.string().trim().max(REVIEW_DECISION_REASON_MAX).optional() })
  .default({})
export type ReviewDecisionRequest = z.infer<typeof reviewDecisionRequestSchema>

export const reviewDecisionResponseSchema = z.object({
  reviewId: z.uuid(),
  status: z.enum(['approved', 'rejected']),
})
export type ReviewDecisionResponse = z.infer<typeof reviewDecisionResponseSchema>

/** `GET /mod/stats`: the Pending count and the age of the oldest Pending Review (PRD §7.10). */
export const modStatsSchema = z.object({
  pendingCount: z.number().int().min(0),
  oldestPendingAt: z.iso.datetime().nullable(),
  oldestPendingAgeSeconds: z.number().int().min(0).nullable(),
})
export type ModStats = z.infer<typeof modStatsSchema>
