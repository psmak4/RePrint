import type { GenreDetailResponse, GenreNode, GenreSort } from '@reprint/shared'
import { GENRE_SORTS } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import type { BookCardData } from './book-card.js'
import { BookGrid } from './book-tile.js'
import { GenreTile } from './genre-tile.js'
import { choiceClass, PageHero, PagerLinks } from './page-hero.js'

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

function Breadcrumb({
  trail,
  label = text.breadcrumbLabel,
}: {
  trail: { href: string; label: string }[]
  label?: string
}) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2">
        {trail.map((crumb, i) => (
          <li key={crumb.href} className="flex gap-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            <Link to={crumb.href} className="text-[#334155] hover:underline">
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** `/genres`: every Genre as a tile; a child Genre is a chip under its parent (PRD §7.5). */
export function GenresIndexPage({ items }: { items: GenreNode[] }) {
  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageHero
        eyebrow={<Breadcrumb trail={[{ href: '/', label: text.discover }]} />}
        title={text.indexTitle}
        lead={text.indexIntro}
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground">{text.indexEmpty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {items.map((node) => (
            <li key={node.slug} className="flex flex-col gap-2">
              <GenreTile
                name={node.name}
                slug={node.slug}
                href={`/genres/${node.slug}`}
                books={[]}
              />
              {node.children.length > 0 ? (
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                  {text.includes}
                  {node.children.map((child) => (
                    <Link
                      key={child.slug}
                      to={`/genres/${child.slug}`}
                      className="inline-flex h-7 items-center rounded-full border border-[#d9d4ca] bg-surface px-2.5 text-[13px] text-[#1e293b] hover:border-input-border"
                    >
                      {child.name}
                    </Link>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** `/genres/:slug`: Books in the Genre and its child Genres, sorted from the URL. */
export function GenrePage({ detail, sort }: { detail: GenreDetailResponse; sort: GenreSort }) {
  const { genre, parent, children, items, page, hasMore } = detail
  const trail = [
    { href: '/genres', label: text.allGenres },
    ...(parent ? [{ href: `/genres/${parent.slug}`, label: parent.name }] : []),
  ]
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero
        eyebrow={<Breadcrumb trail={trail} label={text.parentLabel} />}
        title={genre.name}
        lead={genre.description}
      >
        {children.length > 0 ? (
          <section aria-labelledby="genre-children" className="flex flex-wrap items-center gap-2">
            <h2 id="genre-children" className="mr-1 text-sm text-muted-foreground">
              {text.childrenHeading}
            </h2>
            {children.map((child) => (
              <Link key={child.slug} to={`/genres/${child.slug}`} className={choiceClass(false)}>
                {child.name}
              </Link>
            ))}
          </section>
        ) : null}
      </PageHero>
      <nav aria-label={text.sortLabel} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground">{text.sortLabel}</span>
        {GENRE_SORTS.map((option) => (
          <Link
            key={option}
            to={genreHref(genre.slug, option, 1)}
            aria-current={option === sort ? 'true' : undefined}
            className={choiceClass(option === sort)}
          >
            {text.sorts[option]}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-[#a8a29e] px-6 py-5 text-muted-foreground">
          {text.noBooks}
        </p>
      ) : (
        <BookGrid items={items.map((book) => ({ slug: book.slug, book: summaryCard(book) }))} />
      )}
      {page > 1 || hasMore ? (
        <PagerLinks
          label={text.pagesLabel}
          previous={
            page > 1 ? { href: genreHref(genre.slug, sort, page - 1), text: text.previous } : null
          }
          next={hasMore ? { href: genreHref(genre.slug, sort, page + 1), text: text.next } : null}
          status={text.pageOf(page)}
        />
      ) : null}
    </div>
  )
}
