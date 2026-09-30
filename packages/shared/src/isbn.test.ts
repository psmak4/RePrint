import { describe, expect, it } from 'vitest'
import { isValidIsbn10, isValidIsbn13, toIsbn13 } from './isbn.js'

describe('toIsbn13', () => {
  it('converts a valid ISBN-10', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157')
  })

  it('converts an ISBN-10 with hyphens and an X check digit in either case', () => {
    expect(toIsbn13('0-8044-2957-X')).toBe('9780804429573')
    expect(toIsbn13('080442957x')).toBe('9780804429573')
  })

  it('passes a valid ISBN-13 through, removing hyphens', () => {
    expect(toIsbn13('978-0-306-40615-7')).toBe('9780306406157')
    expect(toIsbn13('9791032305690')).toBe('9791032305690')
  })

  it('rejects a wrong check digit', () => {
    expect(toIsbn13('0306406153')).toBeNull()
    expect(toIsbn13('9780306406158')).toBeNull()
  })

  it('rejects text, wrong lengths, and a non-ISBN 13-digit prefix', () => {
    expect(toIsbn13('')).toBeNull()
    expect(toIsbn13('not an isbn')).toBeNull()
    expect(toIsbn13('030640615')).toBeNull()
    expect(toIsbn13('1234567890123')).toBeNull()
    expect(toIsbn13('X306406152')).toBeNull()
  })
})

describe('isValidIsbn10 and isValidIsbn13', () => {
  it('validate their own formats only', () => {
    expect(isValidIsbn10('0306406152')).toBe(true)
    expect(isValidIsbn10('9780306406157')).toBe(false)
    expect(isValidIsbn13('9780306406157')).toBe(true)
    expect(isValidIsbn13('0306406152')).toBe(false)
  })
})
