import type { ReviewExcerpt } from '@reprint/shared'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import type { BookCardData } from '../books/book-card.js'
import { Cover } from '../books/cover.js'
import { StarRating } from '../books/star-rating.js'

export type SearchResultData = BookCardData & {
  slug?: string
  /** A Source candidate: dashed cover, "Not on RePrint yet". */
  candidate?: boolean
  topReview?: ReviewExcerpt | null
}

/** One search result: cover, title, Author and year, rating, the top review as a quote, shelf control. */
export function SearchResultCard({
  book,
  href,
  shelf,
  onNavigate,
}: {
  book: SearchResultData
  href: string
  shelf?: ReactNode
  onNavigate?: () => void
}) {
  const authors = book.authorNames.join(', ')
  const rated = book.rating && book.rating.average !== null && book.rating.count > 0
  return (
    <article className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      <Cover
        cover={book.cover}
        title={book.title}
        authorName={book.authorNames[0]}
        slug={book.slug}
        dashed={book.candidate}
        size="medium"
      />
      <div className="flex min-w-0 flex-col gap-1">
        {book.candidate ? (
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {copy.search.notOnReprint}
          </p>
        ) : null}
        <h3 className="font-serif text-xl leading-6 font-medium">
          <Link to={href} onClick={onNavigate} className="text-link underline">
            {book.title}
          </Link>
        </h3>
        {book.subtitle ? <p className="text-sm text-muted-foreground">{book.subtitle}</p> : null}
        {authors || book.firstPublishedYear ? (
          <p className="text-sm">
            {[authors ? copy.books.byAuthors(authors) : '', book.firstPublishedYear ?? '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {rated && book.rating?.average != null ? (
          <p className="flex items-center gap-2 text-sm">
            <StarRating average={book.rating.average} />
            <span className="sr-only">
              {copy.books.ratingLabel(book.rating.average.toFixed(1), book.rating.count)}
            </span>
            <span aria-hidden="true">
              <span className="font-semibold">{book.rating.average.toFixed(1)}</span>{' '}
              <span className="text-muted-foreground">
                {copy.books.reviewCount(book.rating.count)}
              </span>
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {book.candidate ? copy.search.beNotFirst : copy.books.noReviews}
          </p>
        )}
        {book.topReview ? (
          <figure className="mt-1 border-l-2 border-border pl-3">
            <blockquote className="text-sm leading-5 break-words">
              {book.topReview.headline ? (
                <span className="font-semibold">{book.topReview.headline}. </span>
              ) : null}
              {book.topReview.excerpt}
            </blockquote>
            <figcaption className="text-xs text-muted-foreground">
              {copy.redesign.reviewExcerpt.by(book.topReview.author.displayName)}
            </figcaption>
          </figure>
        ) : null}
        {shelf ? <div className="mt-1">{shelf}</div> : null}
      </div>
    </article>
  )
}
