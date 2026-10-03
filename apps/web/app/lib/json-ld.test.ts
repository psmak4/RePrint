import type {
  AuthorDetail,
  BookDetail,
  GenreDetailResponse,
  PublicReview,
  SeriesDetailResponse,
} from '@reprint/shared'
import { describe, expect, it } from 'vitest'
import {
  authorBreadcrumbs,
  authorJsonLd,
  bookBreadcrumbs,
  bookJsonLd,
  breadcrumbList,
  genreBreadcrumbs,
  seriesBreadcrumbs,
} from './json-ld.js'

const origin = 'https://reprint.test'
const id = '0192f6a0-0000-7000-8000-000000000001'

const book = {
  id,
  slug: 'dune',
  title: 'Dune',
  subtitle: null,
  description: 'A desert planet.',
  firstPublishedYear: 1965,
  originalLanguage: 'en',
  primaryEditionId: id,
  cover: null,
  contributions: [
    { author: { id, slug: 'frank-herbert', name: 'Frank Herbert' }, role: 'author', position: 0 },
    { author: { id, slug: 'a-translator', name: 'A Translator' }, role: 'translator', position: 1 },
  ],
  series: [],
  genres: [{ slug: 'science-fiction', name: 'Science Fiction' }],
  primaryEdition: {
    id,
    bookId: id,
    isbn13: '9780441013593',
    format: 'paperback',
    language: 'en',
    title: null,
    publisherName: 'Ace',
    publishedDate: '2005-08-02',
    pageCount: 535,
    cover: null,
  },
  editionCount: 1,
  rating: { average: 4.26, count: 5, distribution: [0, 0, 1, 2, 2] },
} as unknown as BookDetail

const review: PublicReview = {
  id,
  rating: 5,
  headline: 'A classic',
  body: 'Worth it.',
  hasSpoilers: false,
  helpfulCount: 2,
  submittedAt: '2026-01-02T03:04:05.000Z',
  author: { username: 'ada', displayName: 'Ada' },
}

describe('bookJsonLd', () => {
  it('describes the Book with its AggregateRating and Reviews', () => {
    const node = bookJsonLd(origin, book, [review])
    expect(node).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Book',
      url: 'https://reprint.test/books/dune',
      name: 'Dune',
      isbn: '9780441013593',
      numberOfPages: 535,
      bookFormat: 'https://schema.org/Paperback',
      publisher: { '@type': 'Organization', name: 'Ace' },
      genre: ['Science Fiction'],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.3,
        ratingCount: 5,
        bestRating: 5,
        worstRating: 1,
      },
      review: [
        {
          '@type': 'Review',
          name: 'A classic',
          reviewBody: 'Worth it.',
          author: { '@type': 'Person', name: 'Ada' },
          reviewRating: { '@type': 'Rating', ratingValue: 5 },
        },
      ],
    })
  })

  it('lists only authors, not translators, as the author', () => {
    expect(bookJsonLd(origin, book, []).author).toEqual([
      {
        '@type': 'Person',
        name: 'Frank Herbert',
        url: 'https://reprint.test/authors/frank-herbert',
      },
    ])
  })

  it('leaves out AggregateRating and Review until the Book has Reviews', () => {
    const unreviewed = {
      ...book,
      rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
    }
    const node = bookJsonLd(origin, unreviewed, [])
    expect(node).not.toHaveProperty('aggregateRating')
    expect(node).not.toHaveProperty('review')
  })
})

describe('authorJsonLd', () => {
  const author = {
    id,
    slug: 'frank-herbert',
    name: 'Frank Herbert',
    alternateNames: ['F. Herbert'],
    bio: 'American author.',
    birthDate: '1920-10-08',
    deathDate: '1986-02-11',
    photo: null,
    works: [],
  } as AuthorDetail

  it('emits a Person with the dates RePrint holds', () => {
    expect(authorJsonLd(origin, author)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      '@id': 'https://reprint.test/authors/frank-herbert',
      url: 'https://reprint.test/authors/frank-herbert',
      name: 'Frank Herbert',
      alternateName: ['F. Herbert'],
      description: 'American author.',
      birthDate: '1920-10-08',
      deathDate: '1986-02-11',
    })
  })

  it('omits what is unknown', () => {
    const node = authorJsonLd(origin, {
      ...author,
      alternateNames: [],
      bio: null,
      birthDate: null,
      deathDate: null,
    })
    expect(Object.keys(node).sort()).toEqual(['@context', '@id', '@type', 'name', 'url'])
  })
})

describe('breadcrumbs', () => {
  const names = (node: Record<string, unknown>) =>
    (node.itemListElement as Array<{ position: number; name: string; item: string }>).map(
      (entry) => [entry.position, entry.name, entry.item],
    )

  it('numbers the crumbs from 1 with absolute URLs', () => {
    expect(
      names(
        breadcrumbList(origin, [
          ['Home', '/'],
          ['Dune', '/books/dune'],
        ]),
      ),
    ).toEqual([
      [1, 'Home', 'https://reprint.test/'],
      [2, 'Dune', 'https://reprint.test/books/dune'],
    ])
  })

  it('puts the first Genre between Home and the Book', () => {
    expect(names(bookBreadcrumbs(origin, book)).map((crumb) => crumb[1])).toEqual([
      'RePrint',
      'Science Fiction',
      'Dune',
    ])
    expect(
      names(bookBreadcrumbs(origin, { ...book, genres: [] })).map((crumb) => crumb[1]),
    ).toEqual(['RePrint', 'Dune'])
  })

  it('covers Author, Genre (with its parent), and Series pages', () => {
    expect(
      names(
        authorBreadcrumbs(origin, { slug: 'frank-herbert', name: 'Frank Herbert' } as AuthorDetail),
      ),
    ).toHaveLength(2)
    const genre = {
      genre: { slug: 'space-opera', name: 'Space Opera', description: null },
      parent: { slug: 'science-fiction', name: 'Science Fiction' },
    } as GenreDetailResponse
    expect(names(genreBreadcrumbs(origin, genre)).map((crumb) => crumb[2])).toEqual([
      'https://reprint.test/',
      'https://reprint.test/genres',
      'https://reprint.test/genres/science-fiction',
      'https://reprint.test/genres/space-opera',
    ])
    const series = { series: { slug: 'dune', name: 'Dune' } } as SeriesDetailResponse
    expect(names(seriesBreadcrumbs(origin, series))[1]).toEqual([
      2,
      'Dune',
      'https://reprint.test/series/dune',
    ])
  })
})
