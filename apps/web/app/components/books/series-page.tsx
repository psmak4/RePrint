import type { SeriesDetailResponse } from '@reprint/shared'
import { copy } from '../../copy/index.js'
import { BookCard } from './book-card.js'
import { summaryCard } from './genre-pages.js'

const text = copy.series

/** `/series/:slug`: Books in reading order, each with its position and rating (PRD §7.5). */
export function SeriesPage({ detail }: { detail: SeriesDetailResponse }) {
  const { series, items } = detail
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{series.name}</h1>
        {series.description ? <p className="text-muted-foreground">{series.description}</p> : null}
      </header>
      <section aria-labelledby="series-books">
        <h2 id="series-books" className="text-xl font-semibold">
          {text.booksHeading}
        </h2>
        {items.length === 0 ? (
          <p className="mt-2 text-muted-foreground">{text.noBooks}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {items.map(({ position, book }) => (
              <li key={book.id} className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-muted-foreground">
                  {position === null ? text.noPosition : text.position(position)}
                </span>
                <BookCard book={summaryCard(book)} href={`/books/${book.slug}`} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
