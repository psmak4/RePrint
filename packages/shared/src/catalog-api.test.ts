import { describe, expect, it } from 'vitest'
import { bookEditionsResponseSchema, ratingSummarySchema, slugParamsSchema } from './index.js'

describe('catalog API schemas', () => {
  it('accepts an empty rating summary and rejects a wrong-length distribution', () => {
    expect(
      ratingSummarySchema.safeParse({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] })
        .success,
    ).toBe(true)
    expect(ratingSummarySchema.safeParse({ average: 4, count: 1, distribution: [1] }).success).toBe(
      false,
    )
  })

  it('accepts only lowercase slugs as parameters', () => {
    expect(slugParamsSchema.safeParse({ slug: 'dune-0a1b2c' }).success).toBe(true)
    expect(slugParamsSchema.safeParse({ slug: 'Dune!' }).success).toBe(false)
  })

  it('accepts an empty Edition list', () => {
    expect(bookEditionsResponseSchema.safeParse({ items: [] }).success).toBe(true)
  })
})
