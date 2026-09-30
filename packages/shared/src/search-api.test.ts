import { describe, expect, it } from 'vitest'
import { SEARCH_PAGE_SIZE, searchQuerySchema, searchResponseSchema } from './index.js'

describe('search API schemas', () => {
  it('defaults to Books, relevance, page 1, and an empty query, and rejects page 0', () => {
    expect(searchQuerySchema.parse({})).toEqual({
      q: '',
      type: 'books',
      sort: 'relevance',
      page: 1,
    })
    expect(searchQuerySchema.parse({ q: ' dune ', page: '2' })).toMatchObject({
      q: 'dune',
      page: 2,
    })
    expect(searchQuerySchema.safeParse({ q: 'dune', page: '0' }).success).toBe(false)
  })

  it('parses filters from a query string and rejects values out of range', () => {
    expect(
      searchQuerySchema.parse({
        q: 'dune',
        genre: 'science-fiction',
        language: 'fr',
        decade: '1990',
        minRating: '4',
        sort: 'newest',
        type: 'authors',
      }),
    ).toMatchObject({
      genre: 'science-fiction',
      language: 'fr',
      decade: 1990,
      minRating: 4,
      sort: 'newest',
      type: 'authors',
    })
    for (const bad of [
      { decade: '1995' },
      { decade: '0' },
      { minRating: '0' },
      { minRating: '4.5' },
      { language: 'English' },
      { genre: 'Not A Slug' },
      { sort: 'best' },
      { type: 'series' },
    ]) {
      expect(searchQuerySchema.safeParse({ q: 'dune', ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      )
    }
  })

  it('accepts an empty result page, and an ISBN match by slug or reference', () => {
    const page = {
      items: [],
      page: 1,
      pageSize: SEARCH_PAGE_SIZE,
      hasMore: false,
      sourceUnavailable: true,
    }
    expect(searchResponseSchema.safeParse({ ...page, isbnMatch: null }).success).toBe(true)
    expect(
      searchResponseSchema.safeParse({ ...page, isbnMatch: { kind: 'book', slug: 'dune-0192a3' } })
        .success,
    ).toBe(true)
    expect(
      searchResponseSchema.safeParse({
        ...page,
        isbnMatch: { kind: 'candidate', ref: 'a'.repeat(22) },
      }).success,
    ).toBe(true)
    expect(searchResponseSchema.safeParse(page).success).toBe(false)
  })
})
