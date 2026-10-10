import type { Cover as CoverData } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from './cover.js'

const text = copy.redesign.series

export type SeriesCardBook = {
  slug: string
  title: string
  cover: CoverData | null
  /** Decimal or empty (PRD §5), so it arrives as text. */
  position: string | null
}

/** The Series a Book belongs to, in reading order, marking the current Book and what is next. */
export function SeriesCard({
  name,
  href,
  books,
  currentSlug,
  total,
}: {
  name: string
  href: string
  books: SeriesCardBook[]
  currentSlug: string
  total?: number | null
}) {
  const index = books.findIndex((book) => book.slug === currentSlug)
  const next = index >= 0 ? books[index + 1] : undefined
  return (
    <section
      aria-labelledby="series-card-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 id="series-card-heading" className="font-serif text-xl font-medium">
        {text.heading}
      </h3>
      <p className="text-sm text-muted-foreground">
        <Link to={href} className="text-link underline">
          {name}
        </Link>
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {books.map((book) => {
          const here = book.slug === currentSlug
          return (
            <li key={book.slug} className="flex items-center gap-3">
              <Cover
                cover={book.cover}
                title={book.title}
                slug={book.slug}
                size="small"
                className="w-8"
              />
              <div className="min-w-0 text-sm">
                {book.position ? (
                  <p className="text-muted-foreground">
                    {text.position(book.position, total ?? null)}
                  </p>
                ) : null}
                {here ? (
                  <p>
                    <span className="font-medium">{book.title}</span>{' '}
                    <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs">
                      {text.youAreHere}
                    </span>
                  </p>
                ) : (
                  <Link to={`/books/${book.slug}`} className="text-link underline">
                    {book.title}
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {next ? (
        <p className="mt-3 text-sm">
          <Link to={`/books/${next.slug}`} className="font-medium text-link underline">
            {text.upNext(next.title)}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
