import { describe, expect, it } from 'vitest'
import { passwordSchema, registerRequestSchema, usernameSchema } from './auth.js'

describe('usernameSchema', () => {
  it('accepts 3 to 30 letters, numbers, and underscores', () => {
    for (const name of ['abc', 'Ada_Lovelace_1', 'a'.repeat(30)])
      expect(usernameSchema.safeParse(name).success).toBe(true)
  })

  it('rejects short, long, and other characters', () => {
    for (const name of ['ab', 'a'.repeat(31), 'has space', 'dash-ed', 'émile', 'a.b'])
      expect(usernameSchema.safeParse(name).success).toBe(false)
  })
})

describe('passwordSchema', () => {
  it('needs at least 12 characters', () => {
    expect(passwordSchema.safeParse('a'.repeat(11)).success).toBe(false)
    expect(passwordSchema.safeParse('a'.repeat(12)).success).toBe(true)
  })

  it('caps the length so hashing cost stays bounded', () => {
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false)
  })
})

describe('registerRequestSchema', () => {
  it('trims the email and requires a valid one', () => {
    const ok = registerRequestSchema.parse({
      email: '  ada@example.test ',
      username: 'ada_l',
      password: 'a'.repeat(12),
    })
    expect(ok.email).toBe('ada@example.test')
    expect(
      registerRequestSchema.safeParse({
        email: 'nope',
        username: 'ada_l',
        password: 'a'.repeat(12),
      }).success,
    ).toBe(false)
  })
})
