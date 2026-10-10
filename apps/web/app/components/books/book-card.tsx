import type { Cover as CoverData } from '@reprint/shared'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from './cover.js'
import { RatingDisplay } from './rating-display.js'

/** What a card needs; a stored Book and a not-yet-stored candidate both fit. */
export type BookCardData = {
  title: string
  subtitle?: string | null
  cover: CoverData | null
  firstPublishedYear: number | null
  authorNames: string[]
  /** Null for a Book RePrint has not stored, which has no reviews. */
  rating: { average: number | null; count: number } | null
}

export function BookCard({
  book,
  href,
  shelf,
  onNavigate,
}: {
  book: BookCardData
  href: string
  /** The shelf control, when the page offers one. */
  shelf?: ReactNode
  /** Called when the title link is followed. */
  onNavigate?: () => void
}) {
  const authors = book.authorNames.join(', ')
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-surface p-5 md:p-6">
      <Cover cover={book.cover} title={book.title} authorName={book.authorNames[0]} size="medium" />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-semibold">
          <Link to={href} onClick={onNavigate} className="text-link underline">
            {book.title}
          </Link>
        </h3>
        {book.subtitle ? <p className="text-sm text-muted-foreground">{book.subtitle}</p> : null}
        {authors ? <p className="text-sm">{copy.books.byAuthors(authors)}</p> : null}
        {book.firstPublishedYear ? (
          <p className="text-sm text-muted-foreground">
            {copy.books.firstPublished(book.firstPublishedYear)}
          </p>
        ) : null}
        <div className="mt-1">
          <RatingDisplay rating={book.rating ?? { average: null, count: 0 }} />
        </div>
        {shelf ? <div className="mt-1">{shelf}</div> : null}
      </div>
    </article>
  )
}
