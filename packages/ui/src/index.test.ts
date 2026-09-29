import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index.js'

describe('@reprint/ui', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@reprint/ui')
  })
})
