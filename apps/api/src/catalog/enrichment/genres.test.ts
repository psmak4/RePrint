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
  it('matches patterns as case-insensitive whole words, plurals included', () => {
    expect(mapSubjectsToGenres(['Epic FANTASY fiction'], rules)).toEqual(['fantasy'])
    expect(mapSubjectsToGenres(['Fantasies'], rules)).toEqual(['fantasy'])
  })

  it('never matches inside another word', () => {
    const art: GenreRule[] = [{ pattern: 'art', genreId: 'arts', priority: 20 }]
    expect(
      mapSubjectsToGenres(
        [
          'Arthur Dent (Fictitious character)',
          'Dent, arthur (fictitious character), fiction',
          'Earth',
        ],
        art,
      ),
    ).toEqual([])
    expect(mapSubjectsToGenres(['Art', 'Modern art'], art)).toEqual(['arts'])
  })

  it('lets the higher priority win when several rules match one Subject', () => {
    expect(mapSubjectsToGenres(['History of magic', 'Magic'], rules)).toEqual(['fantasy'])
  })

  it('needs a strong match or two Subjects before a low-priority rule adds a Genre', () => {
    const weak: GenreRule[] = [
      { pattern: 'travel', genreId: 'travel', priority: 20 },
      { pattern: 'plays', genreId: 'drama', priority: 20 },
      { pattern: 'humor', genreId: 'humor', priority: 20 },
    ]
    // One stray Subject each: dropped.
    expect(mapSubjectsToGenres(['Interstellar travel', 'Radio plays'], weak)).toEqual([])
    // Two Subjects agree: kept.
    expect(mapSubjectsToGenres(['Humor', 'Political humor'], weak)).toEqual(['humor'])
    // A Subject that is exactly the pattern is strong on its own.
    expect(mapSubjectsToGenres(['Travel'], weak)).toEqual(['travel'])
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
