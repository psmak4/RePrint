import { describe, expect, it } from 'vitest'
import {
  averageRating,
  ratingDistribution,
  siteMeanRating,
  WEIGHTED_RATING_C,
  weightedRating,
} from './ratings.js'

describe('weightedRating', () => {
  it('uses C = 5 by default', () => {
    expect(WEIGHTED_RATING_C).toBe(5)
  })

  it('is the site-wide average for a Book with no reviews (n = 0)', () => {
    expect(weightedRating({ reviewCount: 0, ratingSum: 0 }, 3.8)).toBeCloseTo(3.8)
  })

  it('pulls one 5-star review toward the site average', () => {
    // (5 × 3.5 + 5) / (5 + 1) = 3.75
    expect(weightedRating({ reviewCount: 1, ratingSum: 5 }, 3.5)).toBeCloseTo(3.75)
  })

  it('ranks many good reviews above one perfect review', () => {
    const many = weightedRating({ reviewCount: 40, ratingSum: 40 * 4.6 }, 3.5)
    const one = weightedRating({ reviewCount: 1, ratingSum: 5 }, 3.5)
    expect(many).toBeGreaterThan(one)
  })

  it('accepts another C', () => {
    expect(weightedRating({ reviewCount: 2, ratingSum: 10 }, 3, 2)).toBeCloseTo(4)
  })
})

describe('siteMeanRating', () => {
  it('averages over every review, not over Books', () => {
    expect(
      siteMeanRating([
        { reviewCount: 1, ratingSum: 5 },
        { reviewCount: 3, ratingSum: 3 },
      ]),
    ).toBeCloseTo(2)
  })

  it('returns the fallback when nothing is rated', () => {
    expect(siteMeanRating([{ reviewCount: 0, ratingSum: 0 }], 3.5)).toBe(3.5)
    expect(siteMeanRating([])).toBe(0)
  })
})

describe('averageRating', () => {
  it('rounds to one decimal', () => {
    expect(averageRating({ reviewCount: 3, ratingSum: 13 })).toBe(4.3)
    expect(averageRating({ reviewCount: 8, ratingSum: 35 })).toBe(4.4)
  })

  it('is null with no reviews', () => {
    expect(averageRating({ reviewCount: 0, ratingSum: 0 })).toBeNull()
  })
})

describe('ratingDistribution', () => {
  it('lists 5 stars first with counts and shares', () => {
    const buckets = ratingDistribution([1, 0, 0, 1, 2])
    expect(buckets.map((b) => b.rating)).toEqual([5, 4, 3, 2, 1])
    expect(buckets.map((b) => b.count)).toEqual([2, 1, 0, 0, 1])
    expect(buckets[0]?.share).toBeCloseTo(0.5)
  })

  it('has zero shares when there are no reviews', () => {
    expect(ratingDistribution([0, 0, 0, 0, 0]).every((b) => b.share === 0)).toBe(true)
  })

  it('treats missing buckets as zero', () => {
    expect(ratingDistribution([]).map((b) => b.count)).toEqual([0, 0, 0, 0, 0])
  })
})
