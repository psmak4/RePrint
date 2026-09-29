import { describe, expect, it } from 'vitest'
import { generateToken, hashToken } from './tokens.js'

describe('generateToken', () => {
  it('encodes 256 random bits as 43 base64url characters', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
  })

  it('is different every time', () => {
    expect(generateToken()).not.toBe(generateToken())
  })
})

describe('hashToken', () => {
  it('is the SHA-256 hex digest and never the token itself', () => {
    // sha256("abc")
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    const token = generateToken()
    expect(hashToken(token)).not.toContain(token)
  })
})
