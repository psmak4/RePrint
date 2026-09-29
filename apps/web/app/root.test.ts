import { describe, expect, it } from 'vitest'
import { SITE_NAME } from './root.js'

describe('web', () => {
  it('uses the shared app name', () => {
    expect(SITE_NAME).toBe('RePrint')
  })
})
