import { describe, expect, it } from 'vitest'
import { searchTokens, toTsQueryText } from './catalog-search.js'

describe('searchTokens', () => {
  it('keeps lowercase letters and digits from any script and drops punctuation', () => {
    expect(searchTokens('Le Guin\'s  "Left" Hand!')).toEqual(['le', 'guin', 's', 'left', 'hand'])
    expect(searchTokens('Les Misérables 2')).toEqual(['les', 'misérables', '2'])
    expect(searchTokens(' & | ! ( ) :* ')).toEqual([])
  })
})

describe('toTsQueryText', () => {
  it('requires every word and matches the last one as a prefix', () => {
    expect(toTsQueryText('left han')).toBe('left & han:*')
    expect(toTsQueryText('dune')).toBe('dune:*')
  })

  it('never lets query operators through', () => {
    expect(toTsQueryText("dune' | !& (x")).toBe('dune & x:*')
    expect(toTsQueryText('  ')).toBeNull()
  })

  it('turns an ISBN-10 or hyphenated ISBN into its ISBN-13', () => {
    expect(toTsQueryText('0441478123')).toBe('9780441478125:*')
    expect(toTsQueryText('978-0-441-47812-5')).toBe('9780441478125:*')
  })
})
