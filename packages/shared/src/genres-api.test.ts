import { describe, expect, it } from 'vitest'
import { genreBooksQuerySchema, genreTreeResponseSchema } from './genres-api.js'

describe('genreBooksQuerySchema', () => {
  it('defaults to top rated, page 1', () => {
    expect(genreBooksQuerySchema.parse({})).toEqual({ sort: 'top_rated', page: 1 })
  })

  it('accepts the three sorts and rejects others', () => {
    for (const sort of ['top_rated', 'most_reviewed', 'newest_review']) {
      expect(genreBooksQuerySchema.parse({ sort }).sort).toBe(sort)
    }
    expect(genreBooksQuerySchema.safeParse({ sort: 'popular' }).success).toBe(false)
    expect(genreBooksQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('genreTreeResponseSchema', () => {
  it('accepts nested children', () => {
    const leaf = { slug: 'leaf', name: 'Leaf', description: null, featured: false, children: [] }
    const root = { ...leaf, slug: 'root', children: [leaf] }
    expect(genreTreeResponseSchema.parse({ items: [root] }).items[0]?.children).toHaveLength(1)
  })
})
