import type { Cover as CoverData } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { shortDate } from '../../lib/avatar.js'
import { InitialsAvatar } from '../books/avatar.js'
import { Cover } from '../books/cover.js'
import { StarRating } from '../books/star-rating.js'

/** What an excerpt card needs; the API's `reviewExcerptSchema` (D-177) plus the Book it is about. */
export type ReviewExcerptData = {
  rating: number
  headline: string | null
  excerpt: string
  authorName: string
  /** Picks the avatar colour; falls back to the display name. */
  authorUsername?: string
  /** When the review was approved, shown as a short date. */
  approvedAt?: string
}

/**
 * A short quote from an Approved review: the Book's cover and title, stars, the headline in the
 * serif, two lines of the excerpt, and who wrote it. The text is plain (never HTML), already cut
 * by the API, and never from a spoiler review, so it needs no reveal.
 */
export function ReviewExcerpt({
  review,
  book,
  href,
}: {
  review: ReviewExcerptData
  book?: { slug: string; title: string; cover: CoverData | null; authorName?: string | null }
  /** Link to the full review on the Book page. */
  href: string
}) {
  const text = copy.redesign.reviewExcerpt
  return (
    <figure className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 rounded-[14px] border border-border bg-surface p-4 md:grid-cols-[72px_minmax(0,1fr)] md:gap-5 md:p-[22px]">
      {book ? (
        <Link to={href} tabIndex={-1} aria-hidden="true" className="self-start">
          <Cover
            cover={book.cover}
            title={book.title}
            authorName={book.authorName}
            slug={book.slug}
            size="small"
            className="w-full"
          />
        </Link>
      ) : null}
      <div className={`flex min-w-0 flex-col gap-2 ${book ? '' : 'col-span-2'}`}>
        {book ? (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link to={href} className="text-[15px] font-semibold hover:underline">
              {book.title}
            </Link>
            {book.authorName ? (
              <span className="text-sm text-muted-foreground">{book.authorName}</span>
            ) : null}
          </p>
        ) : null}
        <StarRating average={review.rating} className="text-[15px]" />
        {review.headline ? (
          <p className="font-serif text-[21px] leading-tight font-medium">
            {text.quoted(review.headline)}
          </p>
        ) : null}
        <blockquote className="line-clamp-2 text-[15px] leading-[1.55] break-words text-[#334155]">
          {review.excerpt}
        </blockquote>
        <figcaption className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
          <InitialsAvatar
            name={review.authorName}
            colorKey={review.authorUsername ?? review.authorName}
            size="xs"
          />
          <span className="font-medium text-[#1e293b]">{review.authorName}</span>
          {review.approvedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={review.approvedAt}>{shortDate(review.approvedAt)}</time>
            </>
          ) : null}
          {book ? null : (
            <>
              <span aria-hidden="true">·</span>
              <Link to={href} className="text-link underline">
                {copy.home.readMore}
              </Link>
            </>
          )}
        </figcaption>
      </div>
    </figure>
  )
}
