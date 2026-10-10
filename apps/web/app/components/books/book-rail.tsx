import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import type { BookCardData } from './book-card.js'
import { Cover } from './cover.js'
import { StarRating } from './star-rating.js'

export type BookRailItem = {
  slug: string
  book: BookCardData
  /** Extra line under the stars, such as "46 new reviews". */
  note?: string
  /** The shelf button that sits under the cover. */
  shelf?: ReactNode
}

/**
 * A row of cover-first Books: a grid from `lg`, a horizontal scroller below. The scroller is a
 * labelled, focusable region so keyboard users can scroll it.
 */
export function BookRail({
  label,
  items,
  hrefFor = (slug) => `/books/${slug}`,
}: {
  /** Accessible name for the row, normally the section heading's text. */
  label: string
  items: BookRailItem[]
  hrefFor?: (slug: string) => string
}) {
  if (items.length === 0) return null
  return (
    <section
      aria-label={copy.redesign.bookRail.scrollLabel(label)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container must be focusable for keyboard users
      tabIndex={0}
      className="overflow-x-auto lg:overflow-visible"
    >
      <ul className="flex gap-4 lg:grid lg:grid-cols-6 xl:grid-cols-7">
        {items.map(({ slug, book, note, shelf }) => {
          const average = book.rating?.average ?? null
          return (
            <li key={slug} className="flex w-32 shrink-0 flex-col gap-2 lg:w-auto">
              <Link to={hrefFor(slug)} className="block" tabIndex={-1} aria-hidden="true">
                <Cover
                  cover={book.cover}
                  title={book.title}
                  authorName={book.authorNames[0]}
                  slug={slug}
                  size="medium"
                  className="w-full shadow-sm"
                />
              </Link>
              {shelf}
              <h3 className="font-serif text-base leading-5 font-medium md:text-lg md:leading-[22px]">
                <Link to={hrefFor(slug)} className="hover:underline">
                  {book.title}
                </Link>
              </h3>
              {book.authorNames.length > 0 ? (
                <p className="text-sm text-muted-foreground">{book.authorNames.join(', ')}</p>
              ) : null}
              {average !== null && (book.rating?.count ?? 0) > 0 ? (
                <p className="flex items-center gap-2 text-sm">
                  <StarRating average={average} className="text-sm" />
                  <span className="font-medium">{average.toFixed(1)}</span>
                </p>
              ) : null}
              {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
