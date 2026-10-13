import type { SeriesDetailResponse, Viewer } from '@reprint/shared'
import { copy } from '../../copy/index.js'
import { RichText } from '../rich-text.js'
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
  // A recent Series sync is still importing Books the Source lists (D-199).
  const stillAdding = series.adding
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageHero
        eyebrow={
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:text-[13px]">
            {text.eyebrow}
          </p>
        }
        title={series.name}
        lead={
          series.description ? (
            <RichText inline text={series.description} />
          ) : (
            text.bookCount(series.memberCount ?? items.length)
          )
        }
      />
      <section aria-labelledby="series-books" className="flex flex-col gap-5 md:gap-6">
        <h2
          id="series-books"
          className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
        >
          {text.booksHeading}
        </h2>
        {stillAdding ? (
          <p role="status" className="text-sm text-muted-foreground">
            {text.stillAdding}
          </p>
        ) : null}
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
