import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('uses Argon2id with 19 MiB, 2 iterations, and parallelism 1', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('verifies the right password and refuses a wrong one or a malformed hash', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(stored, 'wrong horse battery')).toBe(false)
    expect(await verifyPassword('not-a-real-hash', 'anything')).toBe(false)
  })
})
