import { describe, expect, it } from 'vitest'
import { choosePrimaryEdition, type RankableEdition, rankEditions } from './primary-edition.js'

function edition(id: string, overrides: Partial<RankableEdition> = {}): RankableEdition {
  return {
    id,
    language: 'en',
    coverId: 'cover',
    isbn13: '9780441172719',
    publishedDate: '2000-01-01',
    ...overrides,
  }
}

describe('choosePrimaryEdition', () => {
  it('returns null when there are no Editions', () => {
    expect(choosePrimaryEdition([])).toBeNull()
  })

  it('prefers the Edition whose cover is the Book cover, before the PRD order', () => {
    const list = [
      edition('reissue', { coverRef: 'open_library:2', publishedDate: '2016-07-11' }),
      edition('first', { coverRef: 'open_library:1', isbn13: null, publishedDate: '1979-01-01' }),
    ]
    expect(choosePrimaryEdition(list, 'open_library:1')).toBe('first')
    // Without a Book cover to match, the PRD order applies.
    expect(choosePrimaryEdition(list)).toBe('reissue')
    expect(choosePrimaryEdition(list, 'open_library:9')).toBe('reissue')
  })

  it('prefers English over a newer translation with a cover and ISBN', () => {
    const list = [
      edition('es', { language: 'es', publishedDate: '2020-01-01' }),
      edition('en', { publishedDate: '1990-01-01' }),
    ]
    expect(choosePrimaryEdition(list)).toBe('en')
  })

  it('prefers a cover, then an ISBN, then the most recent, in that order', () => {
    expect(choosePrimaryEdition([edition('bare', { coverId: null }), edition('covered')])).toBe(
      'covered',
    )
    expect(
      choosePrimaryEdition([
        edition('no-isbn', { isbn13: null, publishedDate: '2024-01-01' }),
        edition('isbn', { publishedDate: '1999-01-01' }),
      ]),
    ).toBe('isbn')
    expect(
      choosePrimaryEdition([
        edition('old', { publishedDate: '1999-01-01' }),
        edition('new', { publishedDate: '2011-05-01' }),
      ]),
    ).toBe('new')
  })

  it('ranks an unknown date after a known one and breaks full ties by ID', () => {
    const ranked = rankEditions([
      edition('c', { publishedDate: null }),
      edition('b', { publishedDate: '2001-01-01' }),
      edition('a', { publishedDate: '2001-01-01' }),
    ])
    expect(ranked.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('falls back to a non-English Edition when nothing is English', () => {
    expect(
      choosePrimaryEdition([
        edition('fr', { language: 'fr' }),
        edition('none', { language: null }),
      ]),
    ).toBe('fr')
  })
})
