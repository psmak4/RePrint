import type { Cover as CoverData } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { generatedCoverClass } from '../../lib/cover-color.js'
import { COVER_SHADOW, Cover } from './cover.js'

const FAN = [
  'left-1.5 top-0 -rotate-[9deg]',
  'left-[34px] -top-1 z-10',
  'left-[62px] top-0 rotate-[9deg]',
] as const

/**
 * A browse-by-genre tile: three fanned mini covers above the Genre's name. With no Books to show,
 * the covers are plain generated colours picked from the Genre's slug (decoration only).
 */
export function GenreTile({
  name,
  slug,
  href,
  bookCount,
  books,
}: {
  name: string
  slug: string
  href: string
  bookCount?: number
  /** Up to three Books whose covers fan out on the tile. */
  books: { slug: string; title: string; cover: CoverData | null }[]
}) {
  return (
    <Link
      to={href}
      className="relative flex h-32 flex-col justify-end overflow-hidden rounded-xl border border-border bg-surface p-3 text-foreground hover:border-input-border hover:shadow-[0_6px_18px_-8px_rgba(15,23,42,0.25)] md:h-[168px] md:p-4"
    >
      <span
        aria-hidden="true"
        className="absolute top-3.5 left-1/2 h-16 w-24 origin-top -translate-x-1/2 scale-[0.8] md:top-[18px] md:h-20 md:w-[120px] md:scale-100"
      >
        {[0, 1, 2].map((i) => {
          const book = books[i]
          return book ? (
            <Cover
              key={book.slug}
              cover={book.cover}
              title={book.title}
              slug={book.slug}
              size="small"
              className={`absolute w-[52px] ${FAN[i]}`}
            />
          ) : (
            <span
              key={i}
              className={`absolute h-[78px] w-[52px] rounded-[2px_4px_4px_2px] ${COVER_SHADOW} ${generatedCoverClass(`${slug}-${i}`)} ${FAN[i]}`}
            />
          )
        })}
      </span>
      <span className="text-[15px] leading-tight font-semibold md:text-base">{name}</span>
      {bookCount !== undefined ? (
        <span className="text-sm text-muted-foreground">
          {copy.redesign.genreTile.books(bookCount)}
        </span>
      ) : null}
    </Link>
  )
}
