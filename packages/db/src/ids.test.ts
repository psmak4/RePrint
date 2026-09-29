import { describe, expect, it } from 'vitest'
import { newId } from './ids.js'

describe('newId', () => {
  it('returns a UUID with version 7', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('is unique and roughly time ordered', async () => {
    const first = newId()
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = newId()
    expect(second).not.toBe(first)
    expect(second > first).toBe(true)
  })
})
