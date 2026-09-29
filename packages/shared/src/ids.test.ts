import { describe, expect, it } from 'vitest'
import { idSchema } from './ids.js'

describe('idSchema', () => {
  it('accepts a UUIDv7', () => {
    expect(idSchema.safeParse('0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b').success).toBe(true)
  })

  it('rejects other UUID versions', () => {
    expect(idSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(false)
  })

  it('rejects non-UUID text', () => {
    expect(idSchema.safeParse('the-left-hand-of-darkness').success).toBe(false)
  })
})
