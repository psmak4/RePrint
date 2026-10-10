import type { Cover as CoverData } from '@reprint/shared'
import { cn } from '@reprint/ui'
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
  /** RePrint's average and review count, when the API sends them. */
  rating?: { average: number | null; count: number } | null
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
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {copy.redesign.bookPage.seriesEyebrow}
        </p>
        <h2 id="series-card-heading" className="font-serif text-[22px] leading-tight font-medium">
          <Link to={href} className="hover:underline">
            {name}
          </Link>
        </h2>
      </div>
      <ol className="flex flex-col gap-1">
        {books.map((book) => {
          const here = book.slug === currentSlug
          const average = book.rating?.average ?? null
          const content = (
            <>
              <Cover
                cover={book.cover}
                title={book.title}
                slug={book.slug}
                size="small"
                className="w-full"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {book.position ? text.position(book.position, total ?? null) : null}
                  {here ? ` · ${text.youAreHere}` : null}
                </span>
                <span className="font-serif text-[17px] leading-tight">{book.title}</span>
              </span>
              {average !== null && (book.rating?.count ?? 0) > 0 ? (
                <span className="flex flex-col items-end text-[13px]">
                  <span>
                    <span aria-hidden="true" className="text-star">
                      ★
                    </span>{' '}
                    <span className="font-semibold">{average.toFixed(1)}</span>
                  </span>
                  <span className="text-muted-foreground">{book.rating?.count}</span>
                </span>
              ) : (
                <span />
              )}
            </>
          )
          const row =
            'grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-[10px] p-2.5'
          return (
            <li key={book.slug}>
              {here ? (
                <div aria-current="page" className={cn(row, 'bg-[#eff6ff] outline outline-accent')}>
                  {content}
                </div>
              ) : (
                <Link to={`/books/${book.slug}`} className={cn(row, 'hover:bg-surface-raised')}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
      {next ? (
        <Link
          to={`/books/${next.slug}`}
          className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised p-3.5 text-sm hover:underline"
        >
          <span>{text.upNext(next.title)}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>
      ) : null}
    </section>
  )
}
