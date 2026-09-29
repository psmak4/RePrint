import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index.js'

describe('@reprint/email', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@reprint/email')
  })
})
