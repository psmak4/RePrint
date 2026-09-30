import { describe, expect, it } from 'vitest'
import { SEARCH_PAGE_SIZE, searchQuerySchema, searchResponseSchema } from './index.js'

describe('search API schemas', () => {
  it('defaults to page 1 and an empty query, and rejects page 0', () => {
    expect(searchQuerySchema.parse({})).toEqual({ q: '', page: 1 })
    expect(searchQuerySchema.parse({ q: ' dune ', page: '2' })).toEqual({ q: 'dune', page: 2 })
    expect(searchQuerySchema.safeParse({ q: 'dune', page: '0' }).success).toBe(false)
  })

  it('accepts an empty result page', () => {
    expect(
      searchResponseSchema.safeParse({
        items: [],
        page: 1,
        pageSize: SEARCH_PAGE_SIZE,
        hasMore: false,
        sourceUnavailable: true,
      }).success,
    ).toBe(true)
  })
})
