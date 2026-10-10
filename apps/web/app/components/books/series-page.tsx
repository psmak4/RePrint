import type { SeriesDetailResponse, Viewer } from '@reprint/shared'
import { copy } from '../../copy/index.js'
import { BookGrid } from './book-tile.js'
import { summaryCard } from './genre-pages.js'
import { PageHero } from './page-hero.js'
import { BookShelfSelector } from './shelf-selector.js'

const text = copy.series

/** `/series/:slug`: Books in reading order, each with its position and rating (PRD §7.5). */
export function SeriesPage({
  detail,
  viewer = null,
}: {
  detail: SeriesDetailResponse
  viewer?: Viewer | null
}) {
  const { series, items } = detail
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageHero
        eyebrow={
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:text-[13px]">
            {text.eyebrow}
          </p>
        }
        title={series.name}
        lead={series.description ?? text.bookCount(items.length)}
      />
      <section aria-labelledby="series-books" className="flex flex-col gap-5 md:gap-6">
        <h2
          id="series-books"
          className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
        >
          {text.booksHeading}
        </h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground">{text.noBooks}</p>
        ) : (
          <BookGrid
            items={items.map(({ position, book }) => ({
              slug: book.slug,
              book: summaryCard(book),
              eyebrow: position === null ? text.noPosition : text.position(position),
              shelf: <BookShelfSelector book={book} signedIn={viewer !== null} variant="icon" />,
            }))}
          />
        )}
      </section>
    </div>
  )
}
