import type { GenreDetailResponse, GenreNode, GenreSort } from '@reprint/shared'
import { GENRE_SORTS } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { BookCard, type BookCardData } from './book-card.js'

const text = copy.genres

type BookSummaryItem = GenreDetailResponse['items'][number]

/** The card data for a stored Book, shared by the Genre and Series pages. */
export function summaryCard(book: BookSummaryItem): BookCardData {
  return {
    title: book.title,
    subtitle: book.subtitle,
    cover: book.cover,
    firstPublishedYear: book.firstPublishedYear,
    authorNames: book.contributions
      .filter((c) => c.role === 'author' || c.role === 'co_author')
      .map((c) => c.author.name),
    rating: book.rating,
  }
}

/** The URL of a Genre page for a sort and page; defaults are left out. */
export function genreHref(slug: string, sort: GenreSort, page: number): string {
  const params = new URLSearchParams()
  if (sort !== 'top_rated') params.set('sort', sort)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return `/genres/${slug}${query ? `?${query}` : ''}`
}

function GenreTree({ nodes }: { nodes: GenreNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {nodes.map((node) => (
        <li key={node.slug}>
          <Link to={`/genres/${node.slug}`} className="text-link underline">
            {node.name}
          </Link>
          {node.description ? (
            <p className="text-sm text-muted-foreground">{node.description}</p>
          ) : null}
          {node.children.length > 0 ? (
            <div className="mt-2 ml-4 border-l border-border pl-4">
              <GenreTree nodes={node.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** `/genres`: every Genre, with child Genres nested under their parent (PRD §7.5). */
export function GenresIndexPage({ items }: { items: GenreNode[] }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{text.indexTitle}</h1>
        <p className="text-muted-foreground">{text.indexIntro}</p>
      </header>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{text.indexEmpty}</p>
      ) : (
        <GenreTree nodes={items} />
      )}
    </div>
  )
}

/** `/genres/:slug`: Books in the Genre and its child Genres, sorted from the URL. */
export function GenrePage({ detail, sort }: { detail: GenreDetailResponse; sort: GenreSort }) {
  const { genre, parent, children, items, page, hasMore } = detail
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <nav aria-label={text.parentLabel} className="text-sm">
          <Link to={parent ? `/genres/${parent.slug}` : '/genres'} className="text-link underline">
            {parent ? parent.name : text.allGenres}
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold">{genre.name}</h1>
        {genre.description ? <p className="text-muted-foreground">{genre.description}</p> : null}
      </header>
      {children.length > 0 ? (
        <section aria-labelledby="genre-children">
          <h2 id="genre-children" className="text-lg font-semibold">
            {text.childrenHeading}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {children.map((child) => (
              <li key={child.slug}>
                <Link to={`/genres/${child.slug}`} className="text-link underline">
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <nav aria-label={text.sortLabel} className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{text.sortLabel}</span>
        {GENRE_SORTS.map((option) => (
          <Link
            key={option}
            to={genreHref(genre.slug, option, 1)}
            aria-current={option === sort ? 'true' : undefined}
            className={
              option === sort
                ? 'rounded-md border-b-2 border-primary px-3 py-1 font-semibold'
                : 'px-3 py-1 text-muted-foreground hover:text-foreground'
            }
          >
            {text.sorts[option]}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground">{text.noBooks}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((book) => (
            <li key={book.id}>
              <BookCard book={summaryCard(book)} href={`/books/${book.slug}`} />
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasMore ? (
        <nav aria-label={text.pagesLabel} className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              rel="prev"
              to={genreHref(genre.slug, sort, page - 1)}
              className="text-link underline"
            >
              {text.previous}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">{text.pageOf(page)}</span>
          {hasMore ? (
            <Link
              rel="next"
              to={genreHref(genre.slug, sort, page + 1)}
              className="text-link underline"
            >
              {text.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  )
}
