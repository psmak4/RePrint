import { describe, expect, it } from 'vitest'
import { type GenreRule, mapSubjectsToGenres } from './genres.js'

const rules: GenreRule[] = [
  { pattern: 'fantasy', genreId: 'fantasy', priority: 50 },
  { pattern: 'science fiction', genreId: 'sf', priority: 50 },
  { pattern: 'magic', genreId: 'fantasy', priority: 20 },
  { pattern: 'history', genreId: 'history', priority: 10 },
  { pattern: 'war', genreId: 'military', priority: 50 },
  { pattern: 'historical fiction', genreId: 'historical-fiction', priority: 50 },
]

describe('mapSubjectsToGenres', () => {
  it('matches patterns as case-insensitive substrings', () => {
    expect(mapSubjectsToGenres(['Epic FANTASY fiction'], rules)).toEqual(['fantasy'])
  })

  it('lets the higher priority win when several rules match one Subject', () => {
    expect(mapSubjectsToGenres(['History of magic'], rules)).toEqual(['fantasy'])
  })

  it('breaks a priority tie with the more specific pattern', () => {
    expect(mapSubjectsToGenres(['Historical fiction about war'], rules)).toEqual([
      'historical-fiction',
    ])
  })

  it('maps each Subject once and drops repeats and unmatched Subjects', () => {
    expect(
      mapSubjectsToGenres(['Fantasy', 'Science fiction', 'High fantasy', 'Cookery'], rules),
    ).toEqual(['fantasy', 'sf'])
  })

  it('returns nothing without rules or Subjects', () => {
    expect(mapSubjectsToGenres(['Fantasy'], [])).toEqual([])
    expect(mapSubjectsToGenres([], rules)).toEqual([])
  })
})
