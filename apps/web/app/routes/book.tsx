import {
  APP_NAME,
  authorDetailSchema,
  bookDetailSchema,
  bookEditionsResponseSchema,
  slugSchema,
} from '@reprint/shared'
import { data } from 'react-router'
import { BookPage, type MoreByAuthor } from '../components/books/book-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { groupContributors } from '../lib/contributors.js'
import { coverUrl } from '../lib/cover-url.js'
import { logger } from '../lib/logger.server.js'
import type { Route } from './+types/book'

const MORE_BY_AUTHOR_LIMIT = 6

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: APP_NAME }]
  const { book, canonicalUrl, metaDescription } = loaderData
  const image = coverUrl(book.cover ?? book.primaryEdition?.cover ?? null, 'large')
  return [
    { title: `${book.title} | ${APP_NAME}` },
    { name: 'description', content: metaDescription },
    { tagName: 'link', rel: 'canonical', href: canonicalUrl },
    { property: 'og:type', content: 'book' },
    { property: 'og:site_name', content: APP_NAME },
    { property: 'og:title', content: book.title },
    { property: 'og:description', content: metaDescription },
    { property: 'og:url', content: canonicalUrl },
    ...(image ? [{ property: 'og:image', content: image }] : []),
  ]
}

/** The Book, its Editions, and up to 6 more Books by its first Author, all loaded on the server (PRD §7.4). */
export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })
  const api = apiClientFor(request)

  let response: Response
  try {
    response = await api.get(`/v1/books/${slug.data}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load book')
    throw data(copy.books.page.loadFailed, { status: 502 })
  }
  if (response.status === 404) throw data('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'book request failed')
    throw data(copy.books.page.loadFailed, { status: 502 })
  }
  const book = bookDetailSchema.parse(await response.json())

  const byline = groupContributors(book.contributions)[0]?.people[0]
  const [editions, moreByAuthor] = await Promise.all([
    loadEditions(api, book.slug),
    byline ? loadMoreByAuthor(api, byline.slug, book.id) : null,
  ])

  const authors = groupContributors(book.contributions)
    .find((group) => group.role === 'author')
    ?.people.map((person) => person.name)
    .join(', ')
  const description = book.description?.trim().replace(/\s+/g, ' ')
  const metaDescription = description
    ? description.length > 160
      ? `${description.slice(0, 157)}…`
      : description
    : copy.books.page.metaDescription(book.title, authors ?? '')
  const canonicalUrl = new URL(`/books/${book.slug}`, request.url).toString()

  return { book, editions, moreByAuthor, canonicalUrl, metaDescription }
}

// The side lists are extras: if they fail, the Book still renders without them.
async function loadEditions(api: ReturnType<typeof apiClientFor>, slug: string) {
  try {
    const response = await api.get(`/v1/books/${slug}/editions`)
    if (!response.ok) return []
    return bookEditionsResponseSchema.parse(await response.json()).items
  } catch (error) {
    logger.warn({ err: error }, 'could not load editions')
    return []
  }
}

async function loadMoreByAuthor(
  api: ReturnType<typeof apiClientFor>,
  authorSlug: string,
  bookId: string,
): Promise<MoreByAuthor | null> {
  try {
    const response = await api.get(`/v1/authors/${authorSlug}`)
    if (!response.ok) return null
    const author = authorDetailSchema.parse(await response.json())
    const seen = new Set<string>([bookId])
    const books = author.works
      .flatMap((work) => work.books)
      .filter((other) => !seen.has(other.id) && seen.add(other.id))
      .slice(0, MORE_BY_AUTHOR_LIMIT)
    return books.length > 0 ? { authorName: author.name, authorSlug: author.slug, books } : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load more by author')
    return null
  }
}

export default function Book({ loaderData }: Route.ComponentProps) {
  return (
    <BookPage
      book={loaderData.book}
      editions={loaderData.editions}
      moreByAuthor={loaderData.moreByAuthor}
    />
  )
}
