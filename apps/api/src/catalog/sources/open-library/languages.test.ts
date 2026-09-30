import { describe, expect, it } from 'vitest'
import { toLanguage } from './languages.js'

describe('toLanguage', () => {
  it('maps MARC codes to ISO 639-1', () => {
    expect(toLanguage('eng')).toBe('en')
    expect(toLanguage('fre')).toBe('fr')
    expect(toLanguage('ger')).toBe('de')
    expect(toLanguage('chi')).toBe('zh')
  })

  it('passes other three-letter codes through and lowercases them', () => {
    expect(toLanguage('GLG')).toBe('glg')
  })

  it('returns null for codes that name no language', () => {
    expect(toLanguage('und')).toBeNull()
    expect(toLanguage('zxx')).toBeNull()
    expect(toLanguage('')).toBeNull()
    expect(toLanguage('english')).toBeNull()
  })
})
