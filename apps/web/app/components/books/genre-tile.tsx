import type { Cover as CoverData } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from './cover.js'

/** A browse-by-genre tile: the Genre's name and three fanned mini covers. */
export function GenreTile({
  name,
  href,
  bookCount,
  books,
}: {
  name: string
  href: string
  bookCount?: number
  /** Up to three Books whose covers fan out on the tile. */
  books: { slug: string; title: string; cover: CoverData | null }[]
}) {
  const ROTATE = ['-rotate-6', 'rotate-0', 'rotate-6']
  return (
    <Link
      to={href}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-raised"
    >
      <span aria-hidden="true" className="flex h-16 items-end justify-center -space-x-4">
        {books.slice(0, 3).map((book, i) => (
          <Cover
            key={book.slug}
            cover={book.cover}
            title={book.title}
            slug={book.slug}
            size="small"
            className={`w-10 origin-bottom shadow-md ${ROTATE[i] ?? ''}`}
          />
        ))}
      </span>
      <span className="font-serif text-lg leading-6 font-medium">{name}</span>
      {bookCount !== undefined ? (
        <span className="text-sm text-muted-foreground">
          {copy.redesign.genreTile.books(bookCount)}
        </span>
      ) : null}
    </Link>
  )
}
