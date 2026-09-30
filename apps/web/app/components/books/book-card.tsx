import type { Cover as CoverData } from '@reprint/shared'
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

export function BookCard({ book, href }: { book: BookCardData; href: string }) {
  const authors = book.authorNames.join(', ')
  return (
    <article className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      <Cover cover={book.cover} title={book.title} authorName={book.authorNames[0]} size="medium" />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-semibold">
          <Link to={href} className="text-link underline">
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
      </div>
    </article>
  )
}
