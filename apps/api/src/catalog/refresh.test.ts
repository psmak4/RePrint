import { describe, expect, it } from 'vitest'
import { isStale, STALE_AFTER_MS } from './refresh.js'

describe('isStale', () => {
  const now = new Date('2026-09-30T12:00:00Z')

  it('treats a Book that was never refreshed as stale', () => {
    expect(isStale(null, now)).toBe(true)
  })

  it('is stale only after 30 days', () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS + 1000), now)).toBe(false)
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS - 1000), now)).toBe(true)
  })
})
