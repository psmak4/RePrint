import { describe, expect, it } from 'vitest'
import {
  authorRecordSchema,
  authorSchema,
  bookCandidateSchema,
  bookSchema,
  bookSearchPageSchema,
  contributionSchema,
  coverSchema,
  editionSchema,
  formatSchema,
  genreSchema,
  isbn13Schema,
  languageSchema,
  seriesMembershipSchema,
  sourceLinkSchema,
  subjectSchema,
} from './catalog.js'

const id = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'
const id2 = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c'

const cover = { origin: 'open_library', originRef: '12345', width: null, height: null, url: null }
const author = {
  id,
  slug: 'ursula-k-le-guin-4f5a6b',
  name: 'Ursula K. Le Guin',
  alternateNames: ['Ursula Le Guin'],
  bio: null,
  birthDate: '1929-10-21',
  deathDate: '2018-01-22',
  photo: null,
}
const edition = {
  id,
  bookId: id2,
  isbn13: '9780441478125',
  format: 'paperback',
  language: 'en',
  title: null,
  publisherName: 'Ace',
  publishedDate: '1987-05-01',
  pageCount: 304,
  cover,
}
const sourceLink = { source: 'open_library', entityType: 'book', sourceId: 'X1' }

describe('catalog schemas', () => {
  it('accepts a full Author and rejects a bad date', () => {
    expect(authorSchema.safeParse(author).success).toBe(true)
    expect(authorSchema.safeParse({ ...author, birthDate: '1929' }).success).toBe(false)
    expect(authorSchema.safeParse({ ...author, name: '  ' }).success).toBe(false)
  })

  it('accepts every Contribution role and rejects unknown ones', () => {
    const base = { author: { id, slug: author.slug, name: author.name }, position: 0 }
    for (const role of [
      'author',
      'co_author',
      'translator',
      'illustrator',
      'editor',
      'narrator',
      'other',
    ]) {
      expect(contributionSchema.safeParse({ ...base, role }).success).toBe(true)
    }
    expect(contributionSchema.safeParse({ ...base, role: 'ghostwriter' }).success).toBe(false)
  })

  it('accepts an Edition with missing data and rejects a bad ISBN-13', () => {
    const sparse = {
      ...edition,
      isbn13: null,
      format: 'unknown',
      language: null,
      publisherName: null,
      publishedDate: null,
      pageCount: null,
      cover: null,
    }
    expect(editionSchema.safeParse(sparse).success).toBe(true)
    expect(editionSchema.safeParse(edition).success).toBe(true)
    expect(editionSchema.safeParse({ ...edition, isbn13: '9780441478126' }).success).toBe(false)
    expect(editionSchema.safeParse({ ...edition, pageCount: 0 }).success).toBe(false)
  })

  it('restricts Format to the five values', () => {
    for (const f of ['hardcover', 'paperback', 'ebook', 'audiobook', 'unknown']) {
      expect(formatSchema.safeParse(f).success).toBe(true)
    }
    expect(formatSchema.safeParse('vinyl').success).toBe(false)
  })

  it('accepts ISO 639 codes only', () => {
    expect(languageSchema.safeParse('en').success).toBe(true)
    expect(languageSchema.safeParse('fil').success).toBe(true)
    expect(languageSchema.safeParse('EN').success).toBe(false)
    expect(languageSchema.safeParse('english').success).toBe(false)
  })

  it('checks ISBN-13 digits and check digit', () => {
    expect(isbn13Schema.safeParse('9780441478125').success).toBe(true)
    expect(isbn13Schema.safeParse('978-0441478125').success).toBe(false)
  })

  it('accepts a Cover with a known origin only', () => {
    expect(coverSchema.safeParse(cover).success).toBe(true)
    expect(coverSchema.safeParse({ ...cover, origin: 'google' }).success).toBe(false)
  })

  it('allows a decimal or empty Series position', () => {
    const series = { slug: 'the-expanse-4f5a6b', name: 'The Expanse' }
    expect(seriesMembershipSchema.safeParse({ series, position: 2.5 }).success).toBe(true)
    expect(seriesMembershipSchema.safeParse({ series, position: null }).success).toBe(true)
    expect(seriesMembershipSchema.safeParse({ series, position: -1 }).success).toBe(false)
  })

  it('accepts a Genre with a parent and a Subject with a label', () => {
    const genre = {
      id,
      slug: 'space-opera',
      name: 'Space Opera',
      description: null,
      parentId: id2,
      featured: false,
    }
    expect(genreSchema.safeParse(genre).success).toBe(true)
    expect(genreSchema.safeParse({ ...genre, slug: 'Space Opera' }).success).toBe(false)
    expect(subjectSchema.safeParse({ label: 'Space warfare' }).success).toBe(true)
    expect(subjectSchema.safeParse({ label: '' }).success).toBe(false)
  })

  it('accepts a Source link', () => {
    expect(sourceLinkSchema.safeParse(sourceLink).success).toBe(true)
    expect(sourceLinkSchema.safeParse({ ...sourceLink, sourceId: '' }).success).toBe(false)
  })

  it('requires a Book to have at least one Contribution', () => {
    const book = {
      id,
      slug: 'the-dispossessed-4f5a6b',
      title: 'The Dispossessed',
      subtitle: null,
      description: null,
      firstPublishedYear: 1974,
      originalLanguage: 'en',
      primaryEditionId: null,
      cover: null,
      contributions: [
        { author: { id, slug: author.slug, name: author.name }, role: 'author', position: 0 },
      ],
      series: [],
      genres: [],
      reviewCount: 0,
    }
    expect(bookSchema.safeParse(book).success).toBe(true)
    expect(bookSchema.safeParse({ ...book, contributions: [] }).success).toBe(false)
  })
})

describe('bookCandidateSchema', () => {
  const candidate = {
    book: {
      title: 'The Left Hand of Darkness',
      subtitle: null,
      description: null,
      firstPublishedYear: 1969,
      originalLanguage: 'en',
      cover: null,
      contributions: [{ authorName: 'Ursula K. Le Guin', role: 'author', position: 0 }],
      series: [],
      subjects: [{ label: 'Science fiction' }],
    },
    editions: [
      {
        isbn13: '9780441478125',
        format: 'paperback',
        language: 'en',
        title: null,
        publisherName: null,
        publishedDate: null,
        pageCount: null,
        cover: null,
        sourceLink: { source: 'open_library', entityType: 'edition', sourceId: 'E1' },
      },
    ],
    sourceLink,
    confidence: 0.8,
  }

  it('accepts a candidate with one Edition and a confidence from 0 to 1', () => {
    expect(bookCandidateSchema.safeParse(candidate).success).toBe(true)
    expect(bookCandidateSchema.safeParse({ ...candidate, confidence: 0 }).success).toBe(true)
    expect(bookCandidateSchema.safeParse({ ...candidate, confidence: 1 }).success).toBe(true)
  })

  it('rejects confidence out of range, no Editions, and no Contribution', () => {
    expect(bookCandidateSchema.safeParse({ ...candidate, confidence: 1.1 }).success).toBe(false)
    expect(bookCandidateSchema.safeParse({ ...candidate, confidence: -0.1 }).success).toBe(false)
    expect(bookCandidateSchema.safeParse({ ...candidate, editions: [] }).success).toBe(false)
    expect(
      bookCandidateSchema.safeParse({
        ...candidate,
        book: { ...candidate.book, contributions: [] },
      }).success,
    ).toBe(false)
  })
})

describe('authorRecordSchema and bookSearchPageSchema', () => {
  const sourceLink = { source: 'stub', entityType: 'author', sourceId: 'a1' }

  it('accepts an Author record with a Source link and no RePrint ID', () => {
    const record = {
      name: 'Ursula K. Le Guin',
      alternateNames: [],
      bio: null,
      birthDate: null,
      deathDate: null,
      photo: null,
      sourceLink,
    }
    expect(authorRecordSchema.safeParse(record).success).toBe(true)
    expect(authorRecordSchema.safeParse({ ...record, sourceLink: undefined }).success).toBe(false)
  })

  it('requires a positive page number in a search page', () => {
    expect(
      bookSearchPageSchema.safeParse({ candidates: [], page: 1, hasMore: false }).success,
    ).toBe(true)
    expect(
      bookSearchPageSchema.safeParse({ candidates: [], page: 0, hasMore: false }).success,
    ).toBe(false)
  })
})
