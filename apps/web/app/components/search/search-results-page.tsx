import {
  type BookSummary,
  type GenreNode,
  SEARCH_SORTS,
  type SearchCandidate,
  type SearchQuery,
  type SearchResponse,
  type Viewer,
} from '@reprint/shared'
import { Button, Input, Label } from '@reprint/ui'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { resolveHref, searchHref } from '../../lib/search-links.js'
import { BookCard, type BookCardData } from '../books/book-card.js'
import { BookShelfSelector, ShelfSelector } from '../books/shelf-selector.js'

const LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'sv',
  'pl',
  'ru',
  'ja',
  'zh',
  'ko',
  'ar',
]
const DECADES = Array.from({ length: 24 }, (_, i) => 2020 - i * 10)
const RATINGS = [4, 3, 2, 1]
const SELECT_CLASS =
  'h-10 rounded-md border border-input-border bg-surface px-3 text-sm text-foreground'

function languageName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
}

function fromSummary(book: BookSummary): BookCardData {
  return {
    title: book.title,
    subtitle: book.subtitle,
    cover: book.cover,
    firstPublishedYear: book.firstPublishedYear,
    authorNames: book.contributions
      .filter((contribution) => contribution.role === 'author')
      .map((contribution) => contribution.author.name),
    rating: { average: book.rating.average, count: book.rating.count },
  }
}

function fromCandidate(candidate: SearchCandidate): BookCardData {
  return {
    title: candidate.title,
    subtitle: candidate.subtitle,
    cover: candidate.cover,
    firstPublishedYear: candidate.firstPublishedYear,
    authorNames: candidate.contributions
      .filter((contribution) => contribution.role === 'author')
      .map((contribution) => contribution.authorName),
    rating: null,
  }
}

function Tabs({ query }: { query: SearchQuery }) {
  const c = copy.search
  const tabs = [
    { type: 'books' as const, label: c.booksTab },
    { type: 'authors' as const, label: c.authorsTab },
  ]
  return (
    <nav aria-label={c.tabsLabel} className="flex gap-2 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.type}
          // Filters and sort belong to Books, so a tab switch keeps only the query.
          to={searchHref(
            {
              ...query,
              genre: undefined,
              language: undefined,
              decade: undefined,
              minRating: undefined,
              sort: 'relevance',
            },
            { type: tab.type, page: 1 },
          )}
          aria-current={query.type === tab.type ? 'page' : undefined}
          className={
            query.type === tab.type
              ? 'border-b-2 border-primary px-3 py-2 font-semibold'
              : 'px-3 py-2 text-muted-foreground hover:text-foreground'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

/** The Genre tree as a flat, depth-first list; child Genres are indented with a dash prefix. */
function flattenGenres(nodes: GenreNode[], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((node) => [
    { slug: node.slug, label: `${'– '.repeat(depth)}${node.name}` },
    ...flattenGenres(node.children, depth + 1),
  ])
}

function Filters({ query, genres }: { query: SearchQuery; genres: GenreNode[] }) {
  const c = copy.search
  return (
    <form
      action="/search"
      method="get"
      aria-label={c.filtersLabel}
      className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <input type="hidden" name="q" value={query.q} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-genre">{c.genre}</Label>
        <select
          id="filter-genre"
          name="genre"
          defaultValue={query.genre ?? ''}
          className={SELECT_CLASS}
        >
          <option value="">{c.anyOption}</option>
          {flattenGenres(genres).map((genre) => (
            <option key={genre.slug} value={genre.slug}>
              {genre.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-language">{c.language}</Label>
        <select
          id="filter-language"
          name="language"
          defaultValue={query.language ?? ''}
          className={SELECT_CLASS}
        >
          <option value="">{c.anyOption}</option>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-decade">{c.decade}</Label>
        <select
          id="filter-decade"
          name="decade"
          defaultValue={query.decade ?? ''}
          className={SELECT_CLASS}
        >
          <option value="">{c.anyOption}</option>
          {DECADES.map((year) => (
            <option key={year} value={year}>
              {c.decadeOption(year)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-min-rating">{c.minRating}</Label>
        <select
          id="filter-min-rating"
          name="minRating"
          defaultValue={query.minRating ?? ''}
          className={SELECT_CLASS}
        >
          <option value="">{c.anyOption}</option>
          {RATINGS.map((stars) => (
            <option key={stars} value={stars}>
              {c.minRatingOption(stars)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="filter-sort">{c.sort}</Label>
        <select id="filter-sort" name="sort" defaultValue={query.sort} className={SELECT_CLASS}>
          {SEARCH_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {c.sorts[sort]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit">{c.apply}</Button>
      <Link
        to={searchHref({
          ...query,
          genre: undefined,
          language: undefined,
          decade: undefined,
          minRating: undefined,
          sort: 'relevance',
          page: 1,
        })}
        className="text-link underline"
      >
        {c.clear}
      </Link>
    </form>
  )
}

function Pagination({ query, hasMore }: { query: SearchQuery; hasMore: boolean }) {
  const c = copy.search
  if (query.page === 1 && !hasMore) return null
  return (
    <nav aria-label={c.pagesLabel} className="flex items-center justify-between">
      {query.page > 1 ? (
        <Link
          rel="prev"
          to={searchHref(query, { page: query.page - 1 })}
          className="text-link underline"
        >
          {c.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{c.pageOf(query.page)}</span>
      {hasMore ? (
        <Link
          rel="next"
          to={searchHref(query, { page: query.page + 1 })}
          className="text-link underline"
        >
          {c.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

function Results({ results, signedIn }: { results: SearchResponse; signedIn: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {results.items.map((item) => {
        if (item.kind === 'book') {
          return (
            <li key={`book-${item.book.id}`}>
              <BookCard
                book={fromSummary(item.book)}
                href={`/books/${item.book.slug}`}
                shelf={<BookShelfSelector book={item.book} signedIn={signedIn} />}
              />
            </li>
          )
        }
        if (item.kind === 'candidate') {
          return (
            <li key={`candidate-${item.candidate.ref}`}>
              <BookCard
                book={fromCandidate(item.candidate)}
                href={resolveHref(item.candidate.ref)}
                shelf={
                  <ShelfSelector
                    target={{ kind: 'candidate', ref: item.candidate.ref }}
                    title={item.candidate.title}
                    signedIn={signedIn}
                  />
                }
              />
            </li>
          )
        }
        return (
          <li key={`author-${item.author.id}`}>
            <Link
              to={`/authors/${item.author.slug}`}
              className="block rounded-lg border border-border bg-surface p-4 text-link underline"
            >
              {item.author.name}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The `/search` page: tabs, filters, sort, and results, all driven by the URL (PRD §7.3). */
export function SearchResultsPage({
  query,
  results,
  failed,
  genres = [],
  viewer = null,
}: {
  query: SearchQuery
  results: SearchResponse | null
  failed: boolean
  genres?: GenreNode[]
  viewer?: Viewer | null
}) {
  const c = copy.search
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 py-8">
      <h1 className="text-3xl font-semibold">{c.heading}</h1>
      <search>
        <form action="/search" method="get" className="flex gap-2">
          <Label htmlFor="results-query" className="sr-only">
            {c.queryLabel}
          </Label>
          <Input id="results-query" name="q" type="search" defaultValue={query.q} maxLength={100} />
          {query.type === 'authors' ? <input type="hidden" name="type" value="authors" /> : null}
          <Button type="submit">{copy.shell.search.submit}</Button>
        </form>
      </search>
      <Tabs query={query} />
      {query.type === 'books' ? <Filters query={query} genres={genres} /> : null}
      {failed ? (
        <p role="alert" className="text-danger">
          {c.loadFailed}
        </p>
      ) : results === null ? (
        <p className="text-muted-foreground">{c.prompt}</p>
      ) : (
        <>
          {results.sourceUnavailable ? (
            <p role="status" className="rounded-md border border-border bg-surface p-3 text-sm">
              {c.sourceUnavailable}
            </p>
          ) : null}
          {(query.genre || query.language || query.minRating) && query.type === 'books' ? (
            <p className="text-sm text-muted-foreground">{c.catalogOnly}</p>
          ) : null}
          {results.items.length === 0 ? (
            <p>{c.empty}</p>
          ) : (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                {c.resultCount(results.items.length)}
              </p>
              <Results results={results} signedIn={viewer !== null} />
            </>
          )}
          <Pagination query={query} hasMore={results.hasMore} />
        </>
      )}
    </section>
  )
}
