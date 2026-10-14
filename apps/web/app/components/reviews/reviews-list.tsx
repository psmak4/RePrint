import {
  type BookReviewsResponse,
  type PublicReview,
  REVIEW_SORTS,
  type Viewer,
} from '@reprint/shared'
import { chipVariants, textStyles } from '@reprint/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type ReviewListQuery, reviewsHref } from '../../lib/review-links.js'
import { InitialsAvatar } from '../books/avatar.js'
import { StarRating } from '../books/star-rating.js'
import { TrustBadge } from '../books/trust-badge.js'
import { Pager } from '../common/pager.js'
import { SortControl } from '../common/sort-control.js'
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
    <li className="flex flex-col gap-3 border-b border-border py-5 md:gap-3.5 md:py-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <InitialsAvatar
          name={review.author.displayName}
          colorKey={review.author.username}
          size="md"
          className="size-9 md:size-10"
        />
        <Link
          to={`/u/${review.author.username}`}
          className="text-[15px] font-semibold text-foreground hover:underline md:text-base"
        >
          <span className="sr-only">{text.by('')}</span>
          {review.author.displayName}
        </Link>
        <time dateTime={review.submittedAt} className="ml-auto text-[13px] text-muted-foreground">
          {dateFormat.format(new Date(review.submittedAt))}
        </time>
      </div>
      <span role="img" aria-label={text.ratingOf(review.rating)} className="w-max">
        <StarRating average={review.rating} className="text-base md:text-lg" />
      </span>
      {review.headline ? (
        <h3 className="font-serif text-[21px] leading-tight font-medium md:text-2xl">
          {review.headline}
        </h3>
      ) : null}
      <div className="text-[15px] leading-[1.65] text-foreground md:text-base md:leading-[1.7]">
        {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <HelpfulVote
          reviewId={review.id}
          count={review.helpfulCount}
          voted={voted}
          canVote={canInteract}
        />
        {canInteract ? (
          <span className="ml-auto">
            <ReportReview reviewId={review.id} />
          </span>
        ) : null}
      </div>
    </li>
  )
}

function Controls({ slug, query }: { slug: string; query: ReviewListQuery }) {
  // Changing sort keeps the star filter and resets to page 1 (D-214).
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav aria-label={copy.redesign.bookPage.filterByRating}>
        <ul className="flex flex-wrap gap-2">
          {[undefined, 5, 4, 3, 2, 1].map((stars) => {
            const active = query.rating === stars
            return (
              <li key={stars ?? 'all'}>
                <Link
                  to={reviewsHref(slug, query, { rating: stars, page: 1 })}
                  aria-current={active ? 'true' : undefined}
                  aria-label={stars ? text.starsOnly(stars) : undefined}
                  className={chipVariants({ selected: active })}
                >
                  {stars
                    ? copy.redesign.bookPage.starChip(stars)
                    : copy.redesign.bookPage.allRatings}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex flex-wrap items-center gap-2.5">
        <SortControl
          action={`/books/${slug}`}
          anchor="reviews"
          value={query.sort}
          options={REVIEW_SORTS}
          optionLabel={(sort) => text.sorts[sort]}
          keep={{ rating: query.rating }}
        />
        {query.rating ? (
          <Link
            to={reviewsHref(slug, query, { rating: undefined, page: 1 })}
            className="text-sm text-link underline"
          >
            {text.clearFilter}
          </Link>
        ) : null}
      </div>
    </div>
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
    <Pager
      label={text.pagesLabel}
      previous={
        query.page > 1
          ? { href: reviewsHref(slug, query, { page: query.page - 1 }), text: text.previous }
          : null
      }
      next={
        query.page < totalPages
          ? { href: reviewsHref(slug, query, { page: query.page + 1 }), text: text.next }
          : null
      }
      status={text.pageOf(query.page, totalPages)}
    />
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
  summary,
}: {
  slug: string
  reviews: BookReviewsResponse | null
  query: ReviewListQuery
  hasAnyReviews: boolean
  viewer?: Viewer | null
  votedReviewIds?: string[]
  /** The rating breakdown and the viewer's own review panel, shown under the heading. */
  summary?: ReactNode
}) {
  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="flex scroll-mt-16 flex-col gap-5 md:gap-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="reviews-heading" className={textStyles.sectionTitle}>
          {text.heading}
        </h2>
        <TrustBadge variant="inline" label={copy.redesign.bookPage.moderated} />
      </div>
      {summary}
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
            <ul className="flex flex-col border-t border-border">
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
