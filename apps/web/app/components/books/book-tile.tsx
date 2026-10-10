import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import type { BookCardData } from './book-card.js'
import { Cover } from './cover.js'
import { StarRating } from './star-rating.js'

export type BookTileItem = {
  slug: string
  book: BookCardData
  /** A small label above the title, such as the Shelf in a Library's "All" tab. */
  eyebrow?: string
  /** Extra line under the stars, such as "46 new reviews". */
  note?: string
  /** The shelf control; it sits on the cover's top-right corner (use the `icon` variant). */
  shelf?: ReactNode
}

/** One cover-first Book: cover, serif title, Authors, and stars with the average and count. */
export function BookTile({
  item,
  href,
  className = '',
}: {
  item: BookTileItem
  href: string
  className?: string
}) {
  const { slug, book, eyebrow, note, shelf } = item
  const average = book.rating?.average ?? null
  const count = book.rating?.count ?? 0
  return (
    <li className={`relative flex flex-col gap-1.5 ${className}`}>
      <Link to={href} className="mb-1.5 block" tabIndex={-1} aria-hidden="true">
        <Cover
          cover={book.cover}
          title={book.title}
          authorName={book.authorNames[0]}
          slug={slug}
          size="medium"
          className="w-full"
        />
      </Link>
      {shelf ? <div className="absolute top-2 right-2">{shelf}</div> : null}
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-serif text-base leading-5 font-medium md:text-lg md:leading-[22px]">
        <Link to={href} className="hover:underline">
          {book.title}
        </Link>
      </h3>
      {book.authorNames.length > 0 ? (
        <p className="text-sm text-muted-foreground">{book.authorNames.join(', ')}</p>
      ) : null}
      {average !== null && count > 0 ? (
        <p className="text-sm">
          <span className="sr-only">{copy.books.ratingLabel(average.toFixed(1), count)}</span>
          <span aria-hidden="true" className="flex items-center gap-2">
            <StarRating average={average} className="text-sm" />
            <span className="font-semibold">{average.toFixed(1)}</span>
            <span className="text-muted-foreground">({count})</span>
          </span>
        </p>
      ) : book.rating ? (
        <p className="text-sm text-muted-foreground">{copy.books.noReviews}</p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </li>
  )
}

/** A wrapping grid of `BookTile`s: two across on phones, up to six on wide screens. */
export function BookGrid({
  items,
  hrefFor = (slug) => `/books/${slug}`,
  narrow = false,
}: {
  items: BookTileItem[]
  hrefFor?: (slug: string) => string
  /** In a column beside a sidebar: at most four across. */
  narrow?: boolean
}) {
  if (items.length === 0) return null
  return (
    <ul
      className={`grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 md:gap-x-6 md:gap-y-10 ${narrow ? '' : 'lg:grid-cols-6'}`}
    >
      {items.map((item) => (
        <BookTile key={item.slug} item={item} href={hrefFor(item.slug)} />
      ))}
    </ul>
  )
}
