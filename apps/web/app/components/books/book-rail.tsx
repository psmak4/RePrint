import { copy } from '../../copy/index.js'
import { BookTile, type BookTileItem } from './book-tile.js'

export type BookRailItem = BookTileItem

/**
 * A row of cover-first Books: a grid from `lg`, a horizontal scroller below. The scroller is a
 * labelled, focusable region so keyboard users can scroll it.
 */
export function BookRail({
  label,
  items,
  hrefFor = (slug) => `/books/${slug}`,
  columns = 7,
}: {
  /** How many Books fit across from `xl`: 7 on Discover, 6 on the Book page. */
  columns?: 6 | 7
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
      <ul
        className={`flex gap-4 pb-2 lg:grid lg:grid-cols-6 lg:gap-6 lg:pb-0 ${columns === 7 ? 'xl:grid-cols-7' : ''}`}
      >
        {items.map((item) => (
          <BookTile
            key={item.slug}
            item={item}
            href={hrefFor(item.slug)}
            className="w-[140px] shrink-0 lg:w-auto"
          />
        ))}
      </ul>
    </section>
  )
}
