import type {
  AuthorDetail,
  BookDetail,
  GenreDetailResponse,
  PublicReview,
  SeriesDetailResponse,
} from '@reprint/shared'
import { APP_NAME } from '@reprint/shared'
import { copy } from '../copy/index.js'
import { coverUrl } from './cover-url.js'

/** A schema.org node, ready to serialize. */
export type JsonLdNode = Record<string, unknown>

const SCHEMA_CONTEXT = 'https://schema.org'
const AUTHOR_ROLES: ReadonlySet<string> = new Set(['author', 'co_author'])
const BOOK_FORMATS: Record<string, string> = {
  hardcover: 'Hardcover',
  paperback: 'Paperback',
  ebook: 'EBook',
  audiobook: 'AudiobookFormat',
}

function url(origin: string, path: string): string {
  return new URL(path, origin).toString()
}

/** One crumb per `[name, path]`, with the page's own crumb last (it has no link of its own to follow). */
export function breadcrumbList(
  origin: string,
  trail: ReadonlyArray<readonly [name: string, path: string]>,
): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: url(origin, path),
    })),
  }
}

function reviewNode(review: PublicReview): JsonLdNode {
  return {
    '@type': 'Review',
    ...(review.headline ? { name: review.headline } : {}),
    reviewBody: review.body,
    datePublished: review.submittedAt,
    author: { '@type': 'Person', name: review.author.displayName },
    reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
  }
}

/**
 * `Book` for the Book page (PRD §7.4): details from the Primary Edition, an `AggregateRating` once the
 * Book has Approved Reviews, and a `Review` entry for each Review on the page.
 */
export function bookJsonLd(origin: string, book: BookDetail, reviews: PublicReview[]): JsonLdNode {
  const edition = book.primaryEdition
  const image = coverUrl(book.cover ?? edition?.cover ?? null, 'large')
  const authors = book.contributions
    .filter((contribution) => AUTHOR_ROLES.has(contribution.role))
    .map(({ author }) => ({
      '@type': 'Person',
      name: author.name,
      url: url(origin, `/authors/${author.slug}`),
    }))
  const { average, count } = book.rating
  const node: JsonLdNode = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Book',
    '@id': url(origin, `/books/${book.slug}`),
    url: url(origin, `/books/${book.slug}`),
    name: book.title,
  }
  if (book.subtitle) node.alternativeHeadline = book.subtitle
  if (book.description) node.description = book.description
  if (image) node.image = image
  if (authors.length > 0) node.author = authors
  if (book.genres.length > 0) node.genre = book.genres.map((genre) => genre.name)
  if (book.originalLanguage) node.inLanguage = book.originalLanguage
  if (book.firstPublishedYear) node.datePublished = String(book.firstPublishedYear)
  if (edition?.isbn13) node.isbn = edition.isbn13
  if (edition?.pageCount) node.numberOfPages = edition.pageCount
  if (edition?.publisherName) {
    node.publisher = { '@type': 'Organization', name: edition.publisherName }
  }
  const bookFormat = edition ? BOOK_FORMATS[edition.format] : undefined
  if (bookFormat) node.bookFormat = `${SCHEMA_CONTEXT}/${bookFormat}`
  if (average !== null && count > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(average.toFixed(1)),
      ratingCount: count,
      reviewCount: count,
      bestRating: 5,
      worstRating: 1,
    }
  }
  if (reviews.length > 0) node.review = reviews.map(reviewNode)
  return node
}

/** `BreadcrumbList` for the Book page: Home, the first Genre when there is one, then the Book. */
export function bookBreadcrumbs(origin: string, book: BookDetail): JsonLdNode {
  const genre = book.genres[0]
  return breadcrumbList(origin, [
    [APP_NAME, '/'],
    ...(genre ? ([[genre.name, `/genres/${genre.slug}`]] as const) : []),
    [book.title, `/books/${book.slug}`],
  ])
}

/** `Person` for the Author page, with the dates and photo RePrint holds. */
export function authorJsonLd(origin: string, author: AuthorDetail): JsonLdNode {
  const image = coverUrl(author.photo, 'large')
  const node: JsonLdNode = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Person',
    '@id': url(origin, `/authors/${author.slug}`),
    url: url(origin, `/authors/${author.slug}`),
    name: author.name,
  }
  if (author.alternateNames.length > 0) node.alternateName = author.alternateNames
  if (author.bio) node.description = author.bio
  if (author.birthDate) node.birthDate = author.birthDate
  if (author.deathDate) node.deathDate = author.deathDate
  if (image) node.image = image
  return node
}

export function authorBreadcrumbs(origin: string, author: AuthorDetail): JsonLdNode {
  return breadcrumbList(origin, [
    [APP_NAME, '/'],
    [author.name, `/authors/${author.slug}`],
  ])
}

export function genreBreadcrumbs(origin: string, detail: GenreDetailResponse): JsonLdNode {
  const { genre, parent } = detail
  return breadcrumbList(origin, [
    [APP_NAME, '/'],
    [copy.genres.indexTitle, '/genres'],
    ...(parent ? ([[parent.name, `/genres/${parent.slug}`]] as const) : []),
    [genre.name, `/genres/${genre.slug}`],
  ])
}

export function seriesBreadcrumbs(origin: string, detail: SeriesDetailResponse): JsonLdNode {
  return breadcrumbList(origin, [
    [APP_NAME, '/'],
    [detail.series.name, `/series/${detail.series.slug}`],
  ])
}
