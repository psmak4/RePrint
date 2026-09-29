import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  buildPageMeta,
  cursorPageOf,
  cursorQuerySchema,
  MAX_PAGE_SIZE,
  pageOf,
  pageQuerySchema,
} from './pagination.js'

describe('pageQuerySchema', () => {
  it('applies defaults', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 })
  })

  it('coerces query strings', () => {
    expect(pageQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 })
  })

  it('allows the maximum page size and rejects one above it', () => {
    expect(pageQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE }).success).toBe(true)
    expect(pageQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false)
  })

  it('rejects page 0, fractions, and text', () => {
    expect(pageQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ page: 1.5 }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ page: 'abc' }).success).toBe(false)
  })
})

describe('buildPageMeta', () => {
  it('computes total pages', () => {
    expect(buildPageMeta({ page: 2, pageSize: 20 }, 41)).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    })
  })

  it('handles an empty list', () => {
    expect(buildPageMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(0)
  })
})

describe('cursorQuerySchema', () => {
  it('accepts no cursor and applies the default limit', () => {
    expect(cursorQuerySchema.parse({})).toEqual({ limit: 20 })
  })

  it('accepts a cursor and rejects an empty one', () => {
    expect(cursorQuerySchema.parse({ cursor: 'abc' }).cursor).toBe('abc')
    expect(cursorQuerySchema.safeParse({ cursor: '' }).success).toBe(false)
  })

  it('rejects a limit above the maximum', () => {
    expect(cursorQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false)
  })
})

describe('page envelopes', () => {
  it('validates a page of items', () => {
    const schema = pageOf(z.string())
    const body = { items: ['a'], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
    expect(schema.parse(body)).toEqual(body)
  })

  it('validates a cursor page, with and without a next cursor', () => {
    const schema = cursorPageOf(z.string())
    expect(schema.parse({ items: [], meta: { nextCursor: null } }).meta.nextCursor).toBeNull()
    expect(schema.parse({ items: ['a'], meta: { nextCursor: 'x' } }).meta.nextCursor).toBe('x')
  })
})
