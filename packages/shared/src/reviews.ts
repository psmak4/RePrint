import { z } from 'zod'

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
