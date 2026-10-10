import type { Cover as CoverData } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'
import { StarRating } from '../books/star-rating.js'

/** What an excerpt card needs; the API's `reviewExcerptSchema` (D-177) plus the Book it is about. */
export type ReviewExcerptData = {
  rating: number
  headline: string | null
  excerpt: string
  authorName: string
}

/**
 * A short quote from an Approved review. The text is plain (never HTML), already cut by the API,
 * and never from a spoiler review, so it needs no reveal.
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
    <figure className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      {book ? (
        <Cover
          cover={book.cover}
          title={book.title}
          authorName={book.authorName}
          slug={book.slug}
          size="small"
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        <StarRating average={review.rating} className="text-sm" />
        {review.headline ? (
          <p className="font-serif text-xl leading-6 font-medium">{review.headline}</p>
        ) : null}
        <blockquote className="text-base leading-6 break-words">{review.excerpt}</blockquote>
        <figcaption className="text-sm text-muted-foreground">
          {text.by(review.authorName)}
        </figcaption>
        <Link to={href} className="text-sm text-link underline">
          {book ? text.readFull(book.title) : copy.home.readMore}
        </Link>
      </div>
    </figure>
  )
}
