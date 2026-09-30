import { createSeedRandom } from '@reprint/db'
import { bookCandidateSchema, isValidIsbn13 } from '@reprint/shared'
import { describe, expect, it } from 'vitest'
import { GENERATED_BOOK_COUNT, generateSeedBooks, seedIsbn13 } from './generate.js'

const generate = () => generateSeedBooks(createSeedRandom(7))

describe('generateSeedBooks', () => {
  it('is deterministic', () => {
    expect(generate()).toEqual(generate())
  })

  it('produces candidates that pass the same schema as live data', () => {
    const books = generate()
    expect(books).toHaveLength(GENERATED_BOOK_COUNT)
    for (const { candidate } of books)
      expect(bookCandidateSchema.safeParse(candidate).success).toBe(true)
  })

  it('gives every Book and Edition its own Source ID and every ISBN-13 once', () => {
    const books = generate()
    const bookIds = books.map((b) => b.candidate.sourceLink.sourceId)
    expect(new Set(bookIds).size).toBe(bookIds.length)
    const editions = books.flatMap((b) => b.candidate.editions)
    const editionIds = editions.map((e) => e.sourceLink?.sourceId)
    expect(new Set(editionIds).size).toBe(editionIds.length)
    const isbns = editions.flatMap((e) => (e.isbn13 ? [e.isbn13] : []))
    expect(new Set(isbns).size).toBe(isbns.length)
    expect(isbns.every(isValidIsbn13)).toBe(true)
  })

  it('includes Series, translations, audiobooks, and missing-data cases', () => {
    const candidates = generate().map((b) => b.candidate)
    expect(candidates.some((c) => c.book.series.length > 0)).toBe(true)
    expect(candidates.some((c) => c.book.series.some((s) => s.position === null))).toBe(true)
    expect(
      candidates.some((c) =>
        c.book.series.some((s) => s.position !== null && s.position % 1 !== 0),
      ),
    ).toBe(true)
    expect(candidates.some((c) => c.book.contributions.some((x) => x.role === 'translator'))).toBe(
      true,
    )
    expect(candidates.some((c) => c.editions.some((e) => e.format === 'audiobook'))).toBe(true)
    expect(candidates.some((c) => c.book.description === null)).toBe(true)
    expect(candidates.some((c) => c.book.firstPublishedYear === null)).toBe(true)
    expect(candidates.some((c) => c.editions.some((e) => e.isbn13 === null))).toBe(true)
    expect(candidates.some((c) => c.editions.length >= 3)).toBe(true)
  })
})

describe('seedIsbn13', () => {
  it('builds valid ISBN-13s', () => {
    for (const n of [1, 2, 99, 12345]) expect(isValidIsbn13(seedIsbn13(n))).toBe(true)
  })
})
