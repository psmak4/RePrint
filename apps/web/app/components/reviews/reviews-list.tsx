import {
  type BookReviewsResponse,
  type PublicReview,
  REVIEW_SORTS,
  type Viewer,
} from '@reprint/shared'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type ReviewListQuery, reviewsHref } from '../../lib/review-links.js'
import { HelpfulVote } from './helpful-vote.js'
import { ReportReview } from './report-review.js'
import { SpoilerToggle } from './spoiler-toggle.js'

const text = copy.reviews.list

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

/** Plain text, paragraphs split on blank lines. Never a link, never HTML (PRD §7.6). */
export function ReviewBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim())
  return (
    <div className="flex flex-col gap-2">
      {paragraphs
        .filter((p) => p.length > 0)
        .map((paragraph, i) => (
          // The text never reorders, so the index is a stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: static paragraphs
          <p key={i} className="whitespace-pre-line break-words">
            {paragraph}
          </p>
        ))}
    </div>
  )
}

function ReviewItem({
  review,
  viewer,
  voted,
}: {
  review: PublicReview
  viewer: Viewer | null
  voted: boolean
}) {
  const body = <ReviewBody body={review.body} />
  // Voting and reporting are for verified Members on other people's reviews (PRD §7.6, §7.9).
  const canInteract = viewer?.verified === true && viewer.username !== review.author.username
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="img" aria-label={text.ratingOf(review.rating)} className="text-warning">
          {'★'.repeat(review.rating)}
          <span className="text-input-border">{'★'.repeat(5 - review.rating)}</span>
        </span>
        {review.headline ? <h3 className="font-semibold">{review.headline}</h3> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        <Link to={`/u/${review.author.username}`} className="text-link underline">
          {text.by(review.author.displayName)}
        </Link>{' '}
        ·{' '}
        <time dateTime={review.submittedAt}>{dateFormat.format(new Date(review.submittedAt))}</time>
      </p>
      {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
      <div className="flex flex-wrap items-center gap-3">
        <HelpfulVote
          reviewId={review.id}
          count={review.helpfulCount}
          voted={voted}
          canVote={canInteract}
        />
        {canInteract ? <ReportReview reviewId={review.id} /> : null}
      </div>
    </li>
  )
}

function Controls({ slug, query }: { slug: string; query: ReviewListQuery }) {
  // A plain GET form, so sorting works without JavaScript; changing sort resets to page 1.
  return (
    <Form method="get" action={`/books/${slug}#reviews`} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {text.sortLabel}
        <select
          name="sort"
          defaultValue={query.sort}
          className="rounded-md border border-input-border bg-background px-2 py-1.5"
        >
          {REVIEW_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {text.sorts[sort]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {text.filterLabel}
        <select
          name="rating"
          defaultValue={query.rating ?? ''}
          className="rounded-md border border-input-border bg-background px-2 py-1.5"
        >
          <option value="">{text.allRatings}</option>
          {[5, 4, 3, 2, 1].map((stars) => (
            <option key={stars} value={stars}>
              {text.starsOnly(stars)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md border border-input-border px-3 py-1.5 text-sm hover:bg-surface"
      >
        {text.apply}
      </button>
      {query.rating ? (
        <Link
          to={reviewsHref(slug, query, { rating: undefined, page: 1 })}
          className="py-1.5 text-sm text-link underline"
        >
          {text.clearFilter}
        </Link>
      ) : null}
    </Form>
  )
}

function Pagination({
  slug,
  query,
  totalPages,
}: {
  slug: string
  query: ReviewListQuery
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label={text.pagesLabel} className="flex items-center justify-between">
      {query.page > 1 ? (
        <Link
          rel="prev"
          to={reviewsHref(slug, query, { page: query.page - 1 })}
          className="text-link underline"
        >
          {text.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{text.pageOf(query.page, totalPages)}</span>
      {query.page < totalPages ? (
        <Link
          rel="next"
          to={reviewsHref(slug, query, { page: query.page + 1 })}
          className="text-link underline"
        >
          {text.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

/** The Approved reviews of a Book: sort, star filter, and 10 per page, all in URL params (PRD §7.4). */
export function ReviewsList({
  slug,
  reviews,
  query,
  hasAnyReviews,
  viewer = null,
  votedReviewIds = [],
}: {
  slug: string
  reviews: BookReviewsResponse | null
  query: ReviewListQuery
  hasAnyReviews: boolean
  viewer?: Viewer | null
  votedReviewIds?: string[]
}) {
  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="flex flex-col gap-4">
      <h2 id="reviews-heading" className="text-xl font-semibold">
        {text.heading}
      </h2>
      {reviews === null ? (
        <p role="alert" className="text-muted-foreground">
          {text.loadFailed}
        </p>
      ) : (
        <>
          {hasAnyReviews || query.rating ? <Controls slug={slug} query={query} /> : null}
          {reviews.items.length === 0 ? (
            <p className="text-muted-foreground">
              {query.rating || hasAnyReviews ? text.emptyFiltered : text.empty}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {reviews.items.map((review) => (
                <ReviewItem
                  key={review.id}
                  review={review}
                  viewer={viewer}
                  voted={votedReviewIds.includes(review.id)}
                />
              ))}
            </ul>
          )}
          <Pagination slug={slug} query={query} totalPages={reviews.meta.totalPages} />
        </>
      )}
    </section>
  )
}
