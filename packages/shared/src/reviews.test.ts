import { describe, expect, it } from 'vitest'
import {
  canTransitionReview,
  myReviewSchema,
  nextReviewStatus,
  REVIEW_ACTIONS,
  REVIEW_STATUSES,
  type ReviewStatus,
  reviewInputSchema,
} from './reviews.js'

const valid = { rating: 4, body: 'x'.repeat(50), hasSpoilers: false }

describe('reviewInputSchema', () => {
  it('accepts a minimal review and a full one', () => {
    expect(reviewInputSchema.safeParse(valid).success).toBe(true)
    expect(
      reviewInputSchema.safeParse({
        ...valid,
        headline: 'h'.repeat(120),
        body: 'x'.repeat(10_000),
        hasSpoilers: true,
        editionId: '0192a3b4-0000-7000-8000-000000000001',
      }).success,
    ).toBe(true)
  })

  it('needs a whole rating from 1 to 5', () => {
    for (const rating of [0, 6, 3.5, -1, Number.NaN])
      expect(reviewInputSchema.safeParse({ ...valid, rating }).success).toBe(false)
    for (const rating of [1, 2, 3, 4, 5])
      expect(reviewInputSchema.safeParse({ ...valid, rating }).success).toBe(true)
  })

  it('limits the headline to 120 characters', () => {
    expect(reviewInputSchema.safeParse({ ...valid, headline: 'h'.repeat(121) }).success).toBe(false)
  })

  it('needs a body of 50 to 10,000 characters', () => {
    expect(reviewInputSchema.safeParse({ ...valid, body: 'x'.repeat(49) }).success).toBe(false)
    expect(reviewInputSchema.safeParse({ ...valid, body: 'x'.repeat(10_001) }).success).toBe(false)
  })

  it('counts the trimmed body, so padding cannot reach the minimum', () => {
    expect(
      reviewInputSchema.safeParse({ ...valid, body: `${' '.repeat(20)}${'x'.repeat(40)}` }).success,
    ).toBe(false)
  })

  it('requires the spoiler flag and a UUID Edition', () => {
    expect(reviewInputSchema.safeParse({ rating: 4, body: valid.body }).success).toBe(false)
    expect(reviewInputSchema.safeParse({ ...valid, editionId: 'nope' }).success).toBe(false)
  })
})

describe('nextReviewStatus', () => {
  it('a new review is Pending', () => {
    expect(nextReviewStatus(null, 'submit')).toBe('pending')
  })

  it('cannot submit over an existing review or edit one that does not exist', () => {
    for (const status of REVIEW_STATUSES) expect(nextReviewStatus(status, 'submit')).toBeNull()
    expect(nextReviewStatus(null, 'edit')).toBeNull()
  })

  it('an edit sends every status back to Pending', () => {
    for (const status of REVIEW_STATUSES) expect(nextReviewStatus(status, 'edit')).toBe('pending')
  })

  it('only a Pending review is approved or rejected', () => {
    expect(nextReviewStatus('pending', 'approve')).toBe('approved')
    expect(nextReviewStatus('pending', 'reject')).toBe('rejected')
    for (const status of ['approved', 'rejected', 'unpublished'] as const) {
      expect(nextReviewStatus(status, 'approve')).toBeNull()
      expect(nextReviewStatus(status, 'reject')).toBeNull()
    }
    expect(nextReviewStatus(null, 'approve')).toBeNull()
  })

  it('only an Approved review is unpublished', () => {
    expect(nextReviewStatus('approved', 'unpublish')).toBe('unpublished')
    for (const status of ['pending', 'rejected', 'unpublished'] as const)
      expect(nextReviewStatus(status, 'unpublish')).toBeNull()
    expect(nextReviewStatus(null, 'unpublish')).toBeNull()
  })

  it('has a result for every action', () => {
    expect(REVIEW_ACTIONS).toHaveLength(5)
  })
})

describe('canTransitionReview', () => {
  const allowed: [ReviewStatus, ReviewStatus][] = [
    ['pending', 'approved'],
    ['pending', 'rejected'],
    ['pending', 'pending'],
    ['approved', 'unpublished'],
    ['approved', 'pending'],
    ['rejected', 'pending'],
    ['unpublished', 'pending'],
  ]

  it('allows exactly the PRD transitions', () => {
    for (const from of REVIEW_STATUSES)
      for (const to of REVIEW_STATUSES)
        expect(canTransitionReview(from, to)).toBe(allowed.some(([f, t]) => f === from && t === to))
  })
})

describe('myReviewSchema', () => {
  const base = {
    id: '0192a3b4-0000-7000-8000-000000000001',
    rating: 5,
    headline: null,
    body: 'x'.repeat(50),
    hasSpoilers: false,
    editionId: null,
    status: 'rejected',
    rejectionReason: 'Please remove the personal details.',
    submittedAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:00:00.000Z',
  }

  it('accepts a review with a rejection reason and rejects an unknown status or rating', () => {
    expect(myReviewSchema.safeParse(base).success).toBe(true)
    expect(myReviewSchema.safeParse({ ...base, status: 'hidden' }).success).toBe(false)
    expect(myReviewSchema.safeParse({ ...base, rating: 6 }).success).toBe(false)
  })
})
