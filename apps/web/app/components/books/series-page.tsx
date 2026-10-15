import type { SeriesDetailResponse, Viewer } from '@reprint/shared'
import { textStyles } from '@reprint/ui'
import { copy } from '../../copy/index.js'
import type { RichTree } from '../../lib/rich-tree.js'
import { RichText } from '../rich-text.js'
import { BookGrid } from './book-tile.js'
import { summaryCard } from './genre-pages.js'
import { PageHero } from './page-hero.js'
import { BookShelfSelector } from './shelf-selector.js'

const text = copy.series

/** `/series/:slug`: Books in reading order, each with its position and rating (PRD §7.5). */
export function SeriesPage({
  detail,
  descriptionTree,
  viewer = null,
}: {
  detail: SeriesDetailResponse
  /** `detail.series.description` parsed on the server, inline (M10-T08); `null` when there is none. */
  descriptionTree: RichTree | null
  viewer?: Viewer | null
}) {
  const { series, items } = detail
  // A recent Series sync is still importing Books the Source lists (D-199).
  const stillAdding = series.adding
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageHero
        trail={[{ label: series.name }]}
        label={text.eyebrow}
        title={series.name}
        lead={
          series.description && descriptionTree ? (
            <RichText inline tree={descriptionTree} />
          ) : (
            text.bookCount(series.memberCount ?? items.length)
          )
        }
      />
      <section aria-labelledby="series-books" className="flex flex-col gap-5 md:gap-6">
        <h2 id="series-books" className={textStyles.sectionTitle}>
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
