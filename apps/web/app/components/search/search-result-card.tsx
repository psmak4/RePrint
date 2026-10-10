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

/**
 * One search result row: cover, serif title, Author and year, rating, the top review as a quote,
 * and the shelf control on the right.
 */
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
    <article className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 border-b border-border py-6 md:grid-cols-[88px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[112px_minmax(0,1fr)_auto] lg:gap-7 lg:py-7">
      <Link to={href} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="self-start">
        <Cover
          cover={book.cover}
          title={book.title}
          authorName={book.authorNames[0]}
          slug={book.slug ?? book.title}
          dashed={book.candidate}
          size="medium"
          className="w-full"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-2.5">
        <h3 className="font-serif text-[22px] leading-[1.15] font-medium md:text-[26px]">
          <Link to={href} onClick={onNavigate} className="text-foreground hover:underline">
            {book.title}
          </Link>
        </h3>
        {book.subtitle ? <p className="text-sm text-muted-foreground">{book.subtitle}</p> : null}
        {authors || book.firstPublishedYear ? (
          <p className="text-[15px] text-muted-foreground">
            {authors ? <span className="text-[#1e293b]">{authors}</span> : null}
            {authors && book.firstPublishedYear ? ' · ' : null}
            {book.firstPublishedYear ? copy.search.firstPublished(book.firstPublishedYear) : null}
          </p>
        ) : null}
        {book.candidate ? (
          <p className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex h-[26px] items-center rounded-full bg-[#ece8e0] px-2.5 text-[13px] font-medium text-[#334155]">
              {copy.search.notOnReprint}
            </span>
            <span className="text-[15px] text-muted-foreground">{copy.search.beNotFirst}</span>
          </p>
        ) : rated && book.rating?.average != null ? (
          <p className="flex flex-wrap items-center gap-2.5 text-[15px]">
            <StarRating average={book.rating.average} className="text-[17px]" />
            <span className="sr-only">
              {copy.books.ratingLabel(book.rating.average.toFixed(1), book.rating.count)}
            </span>
            <span aria-hidden="true" className="flex items-center gap-2.5">
              <span className="font-semibold">{book.rating.average.toFixed(1)}</span>
              <span className="text-link">
                {copy.redesign.bookPage.reviewsLink(book.rating.count)}
              </span>
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.books.noReviews}</p>
        )}
        {book.topReview ? (
          <figure className="border-l-2 border-[#d9d4ca] pl-4">
            <blockquote className="font-serif text-[17px] leading-normal break-words text-[#334155] italic">
              {copy.redesign.reviewExcerpt.quoted(
                book.topReview.headline
                  ? `${book.topReview.headline}. ${book.topReview.excerpt}`
                  : book.topReview.excerpt,
              )}
            </blockquote>
            <figcaption className="mt-1 text-sm text-muted-foreground">
              {copy.redesign.reviewExcerpt.by(book.topReview.author.displayName)}
            </figcaption>
          </figure>
        ) : null}
      </div>
      {shelf ? (
        <div className="col-start-2 lg:col-start-3 lg:min-w-[170px] lg:justify-self-end">
          {shelf}
        </div>
      ) : null}
    </article>
  )
}
