import {
  APP_NAME,
  authorDetailSchema,
  bookDetailSchema,
  bookEditionsResponseSchema,
  bookReviewsQuerySchema,
  bookReviewsResponseSchema,
  deleteMyReviewResponseSchema,
  genreDetailResponseSchema,
  myHelpfulVotesResponseSchema,
  myReviewSchema,
  reviewInputSchema,
  seriesDetailResponseSchema,
  slugSchema,
} from '@reprint/shared'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import {
  type AuthorSummary,
  BookPage,
  type MoreByAuthor,
  type MoreInGenre,
  type SeriesSummary,
} from '../components/books/book-page.js'
import { JsonLd } from '../components/seo/json-ld.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, loadSession, sendToApi } from '../lib/auth.server.js'
import { groupContributors } from '../lib/contributors.js'
import { coverUrl } from '../lib/cover-url.js'
import { bookBreadcrumbs, bookJsonLd } from '../lib/json-ld.js'
import { logger } from '../lib/logger.server.js'
import type { ReviewListQuery } from '../lib/review-links.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/book'

const MORE_BY_AUTHOR_LIMIT = 6

export function meta(args: Route.MetaArgs) {
  if (!args.loaderData) return [{ title: APP_NAME }]
  const { book, canonicalUrl, metaDescription } = args.loaderData
  return pageMeta(args, {
    title: `${book.title} | ${APP_NAME}`,
    description: metaDescription,
    canonicalUrl,
    openGraph: {
      type: 'book',
      title: book.title,
      image: coverUrl(book.cover ?? book.primaryEdition?.cover ?? null, 'large'),
    },
  })
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
  // An old slug of a merged Book answers with the remaining Book; send the visitor to its address.
  if (book.slug !== slug.data) {
    throw redirect(`/books/${book.slug}${new URL(request.url).search}`, 301)
  }

  const byline = groupContributors(book.contributions)[0]?.people[0]
  const url = new URL(request.url)
  const parsedQuery = bookReviewsQuerySchema.safeParse({
    sort: url.searchParams.get('sort') || undefined,
    rating: url.searchParams.get('rating') || undefined,
    page: url.searchParams.get('page') || undefined,
  })
  const reviewQuery: ReviewListQuery = parsedQuery.success
    ? { sort: parsedQuery.data.sort, rating: parsedQuery.data.rating, page: parsedQuery.data.page }
    : { sort: 'most_helpful', page: 1 }

  const firstSeries = book.series[0]?.series
  const firstGenre = book.genres[0]
  const [editions, authorData, series, moreInGenre, session, reviews] = await Promise.all([
    loadEditions(api, book.slug),
    byline ? loadAuthor(api, byline.slug, book.id) : null,
    firstSeries ? loadSeries(api, firstSeries.slug) : null,
    firstGenre ? loadMoreInGenre(api, firstGenre, book.id) : null,
    loadSession(request),
    loadReviews(api, book.slug, reviewQuery),
  ])
  const moreByAuthor = authorData?.moreByAuthor ?? null
  const authorCard = authorData?.card ?? null
  const viewer = session.viewer
  const [myReview, votedReviewIds] = viewer
    ? await Promise.all([loadMyReview(api, book.slug), loadVotedReviewIds(api, book.slug)])
    : [null, []]

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
  const { origin } = new URL(request.url)
  const jsonLd = [bookJsonLd(origin, book, reviews?.items ?? []), bookBreadcrumbs(origin, book)]

  return {
    book,
    editions,
    moreByAuthor,
    authorCard,
    series,
    moreInGenre,
    viewer,
    myReview,
    reviews,
    votedReviewIds,
    reviewQuery,
    canonicalUrl,
    metaDescription,
    jsonLd,
  }
}

// The list is an extra: if it fails, the rest of the page still renders with a short notice.
async function loadReviews(
  api: ReturnType<typeof apiClientFor>,
  slug: string,
  query: ReviewListQuery,
) {
  try {
    const params = new URLSearchParams({ sort: query.sort, page: String(query.page) })
    if (query.rating) params.set('rating', String(query.rating))
    const response = await api.get(`/v1/books/${slug}/reviews?${params}`)
    if (!response.ok) return null
    return bookReviewsResponseSchema.parse(await response.json())
  } catch (error) {
    logger.warn({ err: error }, 'could not load reviews')
    return null
  }
}

// Without the list, the buttons just start unpressed.
async function loadVotedReviewIds(api: ReturnType<typeof apiClientFor>, slug: string) {
  try {
    const response = await api.get(`/v1/books/${slug}/helpful-votes`)
    if (!response.ok) return []
    return myHelpfulVotesResponseSchema.parse(await response.json()).reviewIds
  } catch (error) {
    logger.warn({ err: error }, 'could not load helpful votes')
    return []
  }
}

// A Member without a Review gets 404 (D-118); any other failure just hides the panel's "your review" part.
async function loadMyReview(api: ReturnType<typeof apiClientFor>, slug: string) {
  try {
    const response = await api.get(`/v1/books/${slug}/my-review`)
    if (!response.ok) return null
    return myReviewSchema.parse(await response.json())
  } catch (error) {
    logger.warn({ err: error }, 'could not load my review')
    return null
  }
}

const reviewActionSchema = z.discriminatedUnion('intent', [
  reviewInputSchema.extend({ intent: z.literal('save') }),
  z.object({ intent: z.literal('delete') }),
])

/** Saves or deletes the viewer's own Review of this Book (PRD §7.6). */
export async function action({ request, params }: Route.ActionArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })
  const parsed = reviewActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: copy.reviews.form.failed }, { status: 400 })
  const path = `/v1/books/${slug.data}/my-review`
  if (parsed.data.intent === 'delete') {
    const result = await sendToApi(request, 'DELETE', path, null, copy.reviews.form.failed)
    if (!result.ok) return failed(result)
    deleteMyReviewResponseSchema.parse(result.body)
    return { deleted: true }
  }
  const { intent: _intent, ...input } = parsed.data
  const result = await sendToApi(request, 'PUT', path, input, copy.reviews.form.failed)
  if (!result.ok) return failed(result)
  return { saved: true }
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

async function loadAuthor(
  api: ReturnType<typeof apiClientFor>,
  authorSlug: string,
  bookId: string,
): Promise<{ moreByAuthor: MoreByAuthor | null; card: AuthorSummary } | null> {
  try {
    const response = await api.get(`/v1/authors/${authorSlug}`)
    if (!response.ok) return null
    const author = authorDetailSchema.parse(await response.json())
    const seen = new Set<string>()
    const all = author.works
      .flatMap((work) => work.books)
      .filter((other) => !seen.has(other.id) && seen.add(other.id))
    const books = all.filter((other) => other.id !== bookId).slice(0, MORE_BY_AUTHOR_LIMIT)
    return {
      moreByAuthor:
        books.length > 0 ? { authorName: author.name, authorSlug: author.slug, books } : null,
      card: {
        name: author.name,
        slug: author.slug,
        photo: author.photo,
        born: author.birthDate,
        died: author.deathDate,
        bio: author.bio,
        bookCount: all.length,
      },
    }
  } catch (error) {
    logger.warn({ err: error }, 'could not load author')
    return null
  }
}

async function loadSeries(
  api: ReturnType<typeof apiClientFor>,
  seriesSlug: string,
): Promise<SeriesSummary | null> {
  try {
    const response = await api.get(`/v1/series/${seriesSlug}`)
    if (!response.ok) return null
    const detail = seriesDetailResponseSchema.parse(await response.json())
    if (detail.items.length === 0) return null
    return {
      name: detail.series.name,
      slug: detail.series.slug,
      total: detail.items.length,
      books: detail.items.map((item) => ({
        slug: item.book.slug,
        title: item.book.title,
        cover: item.book.cover,
        position: item.position === null ? null : String(item.position),
      })),
    }
  } catch (error) {
    logger.warn({ err: error }, 'could not load series')
    return null
  }
}

async function loadMoreInGenre(
  api: ReturnType<typeof apiClientFor>,
  genre: { slug: string; name: string },
  bookId: string,
): Promise<MoreInGenre | null> {
  try {
    const response = await api.get(`/v1/genres/${genre.slug}?sort=top_rated`)
    if (!response.ok) return null
    const detail = genreDetailResponseSchema.parse(await response.json())
    const books = detail.items.filter((other) => other.id !== bookId).slice(0, MORE_BY_AUTHOR_LIMIT)
    return books.length > 0 ? { genreName: genre.name, genreSlug: genre.slug, books } : null
  } catch (error) {
    logger.warn({ err: error }, 'could not load more in genre')
    return null
  }
}

export default function Book({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <JsonLd data={loaderData.jsonLd} />
      <BookPage
        book={loaderData.book}
        editions={loaderData.editions}
        moreByAuthor={loaderData.moreByAuthor}
        author={loaderData.authorCard}
        series={loaderData.series}
        moreInGenre={loaderData.moreInGenre}
        viewer={loaderData.viewer}
        myReview={loaderData.myReview}
        reviews={loaderData.reviews}
        reviewQuery={loaderData.reviewQuery}
        votedReviewIds={loaderData.votedReviewIds}
      />
    </>
  )
}
