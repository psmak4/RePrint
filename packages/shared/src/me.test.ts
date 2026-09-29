import { describe, expect, it } from 'vitest'
import { changePasswordRequestSchema, updateMeRequestSchema } from './me.js'

describe('updateMeRequestSchema', () => {
  it('accepts any subset of fields and trims text', () => {
    expect(updateMeRequestSchema.parse({ displayName: '  Ada  ' })).toEqual({ displayName: 'Ada' })
    expect(
      updateMeRequestSchema.parse({ libraryPublic: false, emailReviewDecisions: false }),
    ).toEqual({ libraryPublic: false, emailReviewDecisions: false })
  })

  it('stores an empty bio as null and allows clearing it', () => {
    expect(updateMeRequestSchema.parse({ bio: '   ' })).toEqual({ bio: null })
    expect(updateMeRequestSchema.parse({ bio: null })).toEqual({ bio: null })
  })

  it('caps the bio at 280 characters', () => {
    expect(updateMeRequestSchema.safeParse({ bio: 'x'.repeat(280) }).success).toBe(true)
    expect(updateMeRequestSchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false)
  })

  it('rejects an empty update, a blank display name, and unknown fields', () => {
    expect(updateMeRequestSchema.safeParse({}).success).toBe(false)
    expect(updateMeRequestSchema.safeParse({ displayName: '   ' }).success).toBe(false)
    expect(updateMeRequestSchema.safeParse({ displayName: 'x'.repeat(51) }).success).toBe(false)
    expect(updateMeRequestSchema.safeParse({ username: 'other' }).success).toBe(false)
  })
})

describe('changePasswordRequestSchema', () => {
  it('needs the current password and a valid new one', () => {
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'a'.repeat(12) })
        .success,
    ).toBe(true)
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: '', newPassword: 'a'.repeat(12) })
        .success,
    ).toBe(false)
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'old', newPassword: 'short' })
        .success,
    ).toBe(false)
  })
})
