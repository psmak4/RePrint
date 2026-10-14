import {
  APP_NAME,
  type BookRelatedResponse,
  bookDetailSchema,
  bookEditionsResponseSchema,
  bookRelatedResponseSchema,
  bookReviewsQuerySchema,
  bookReviewsResponseSchema,
  deleteMyReviewResponseSchema,
  markdownToText,
  myHelpfulVotesResponseSchema,
  myReviewSchema,
  reviewInputSchema,
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
import { failed, sendToApi } from '../lib/auth.server.js'
import { groupContributors } from '../lib/contributors.js'
import { coverUrl } from '../lib/cover-url.js'
import { bookBreadcrumbs, bookJsonLd } from '../lib/json-ld.js'
import { logger } from '../lib/logger.server.js'
import type { ReviewListQuery } from '../lib/review-links.js'
import { pageMeta } from '../lib/seo.js'
import { hasSessionCookie, viewerSession } from '../lib/session.server.js'
import type { Route } from './+types/book'

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

/**
 * The Book, its Editions, and up to 6 more Books by its first Author, all loaded on the server
 * (PRD §7.4). Everything needs only the slug, so it is all asked for at once (M10-T03), the rails
 * included (M10-T06).
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const slug = slugSchema.safeParse(params.slug)
  if (!slug.success) throw data('Not found', { status: 404 })
  const api = apiClientFor(request)
  const url = new URL(request.url)
  const parsedQuery = bookReviewsQuerySchema.safeParse({
    sort: url.searchParams.get('sort') || undefined,
    rating: url.searchParams.get('rating') || undefined,
    page: url.searchParams.get('page') || undefined,
  })
  const reviewQuery: ReviewListQuery = parsedQuery.success
    ? { sort: parsedQuery.data.sort, rating: parsedQuery.data.rating, page: parsedQuery.data.page }
    : { sort: 'most_helpful', page: 1 }

  // Each of these settles on its own (a failure becomes an empty part), so none can reject while
  // the Book is awaited. A Visitor has no cookie, so nothing is asked about their review.
  const signedIn = hasSessionCookie(request)
  const pending = Promise.all([
    loadEditions(api, slug.data),
    viewerSession({ request, context }),
    loadReviews(api, slug.data, reviewQuery),
    signedIn ? loadMyReview(api, slug.data) : null,
    signedIn ? loadVotedReviewIds(api, slug.data) : [],
    loadRelated(api, slug.data),
  ])
  const book = await loadBook(api, slug.data)
  // An old slug of a merged Book answers with the remaining Book; send the visitor to its address.
  // What was asked for under the old slug is dropped with this request.
  if (book.slug !== slug.data) {
    throw redirect(`/books/${book.slug}${url.search}`, 301)
  }

  const [editions, session, reviews, myReview, votedReviewIds, related] = await pending
  const { moreByAuthor, authorCard, series, moreInGenre } = railsOf(related)
  const viewer = session.viewer

  const authors = groupContributors(book.contributions)
    .find((group) => group.role === 'author')
    ?.people.map((person) => person.name)
    .join(', ')
  const description = markdownToText(book.description ?? '').replace(/\s+/g, ' ')
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
    myReview: viewer ? myReview : null,
    reviews,
    votedReviewIds: viewer ? votedReviewIds : [],
    reviewQuery,
    canonicalUrl,
    metaDescription,
    jsonLd,
  }
}

/** The Book itself: a 404 when there is none, a 502 when the API fails. */
async function loadBook(api: ReturnType<typeof apiClientFor>, slug: string) {
  let response: Response
  try {
    response = await api.get(`/v1/books/${slug}`)
  } catch (error) {
    logger.error({ err: error }, 'could not load book')
    throw data(copy.books.page.loadFailed, { status: 502 })
  }
  if (response.status === 404) throw data('Not found', { status: 404 })
  if (!response.ok) {
    logger.error({ status: response.status }, 'book request failed')
    throw data(copy.books.page.loadFailed, { status: 502 })
  }
  return bookDetailSchema.parse(await response.json())
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

/** The Book page's rails, from the one request that gathers them (M10-T06); none when it fails. */
async function loadRelated(
  api: ReturnType<typeof apiClientFor>,
  slug: string,
): Promise<BookRelatedResponse | null> {
  try {
    const response = await api.get(`/v1/books/${slug}/related`)
    if (!response.ok) return null
    return bookRelatedResponseSchema.parse(await response.json())
  } catch (error) {
    logger.warn({ err: error }, 'could not load the rails')
    return null
  }
}

function railsOf(related: BookRelatedResponse | null): {
  moreByAuthor: MoreByAuthor | null
  authorCard: AuthorSummary | null
  series: SeriesSummary | null
  moreInGenre: MoreInGenre | null
} {
  const author = related?.author ?? null
  const series = related?.series ?? null
  const genre = related?.genre ?? null
  return {
    moreByAuthor:
      author && author.books.length > 0
        ? { authorName: author.name, authorSlug: author.slug, books: author.books }
        : null,
    authorCard: author
      ? {
          name: author.name,
          slug: author.slug,
          photo: author.photo,
          born: author.birthDate,
          died: author.deathDate,
          bio: author.bio,
          bookCount: author.bookCount,
        }
      : null,
    series: series
      ? {
          name: series.name,
          slug: series.slug,
          // The Source's count, not the stored Books: "Book 1 of 1" was wrong while the rest were missing.
          total: series.memberCount,
          stored: series.total,
          books: series.items.map((item) => ({
            slug: item.book.slug,
            title: item.book.title,
            cover: item.book.cover,
            position: item.position === null ? null : String(item.position),
            rating: item.book.rating,
          })),
        }
      : null,
    moreInGenre: genre
      ? { genreName: genre.name, genreSlug: genre.slug, books: genre.books }
      : null,
  }
}

export default function Book({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <JsonLd data={loaderData.jsonLd} />
      <BookPage
        // Moving to another Book keeps this route mounted; a new key starts the page afresh, so no
        // state from the last Book (its Shelf, a review being edited, filters) carries over.
        key={loaderData.book.id}
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
