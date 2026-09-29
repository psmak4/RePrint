import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index.js'

describe('@reprint/db', () => {
  it('loads', () => {
    expect(PACKAGE_NAME).toBe('@reprint/db')
  })
})
