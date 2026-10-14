import {
  type AuthorSuggestion,
  type BookSummary,
  type GenreNode,
  SEARCH_SORTS,
  type SearchCandidate,
  type SearchQuery,
  type SearchResponse,
  type Viewer,
} from '@reprint/shared'
import { Button, buttonVariants, cn, Label, Select } from '@reprint/ui'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ANALYTICS_EVENTS, trackEvent } from '../../lib/analytics.js'
import { sendReached } from '../../lib/reached.js'
import { resolveHref, searchHref } from '../../lib/search-links.js'
import { AuthorMatchCard } from '../books/author-match-card.js'
import { InitialsAvatar } from '../books/avatar.js'
import { PageHero } from '../books/page-hero.js'
import { BookShelfSelector, ShelfSelector } from '../books/shelf-selector.js'
import { TabNav } from '../common/tab-nav.js'
import { SearchResultCard, type SearchResultData } from './search-result-card.js'

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

function languageName(code: string): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
}

function fromSummary(
  book: BookSummary,
  topReview: SearchResultData['topReview'],
): SearchResultData {
  return {
    slug: book.slug,
    topReview,
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

function fromCandidate(candidate: SearchCandidate): SearchResultData {
  return {
    candidate: true,
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
    <TabNav
      label={c.tabsLabel}
      tabs={tabs.map((tab) => ({
        label: tab.label,
        // Filters and sort belong to Books, so a tab switch keeps only the query.
        to: searchHref(
          {
            ...query,
            genre: undefined,
            language: undefined,
            decade: undefined,
            minRating: undefined,
            sort: 'relevance',
          },
          { type: tab.type, page: 1 },
        ),
        current: query.type === tab.type,
      }))}
    />
  )
}

/** The Genre tree as a flat, depth-first list; child Genres are indented with a dash prefix. */
function flattenGenres(nodes: GenreNode[], depth = 0): { slug: string; label: string }[] {
  return nodes.flatMap((node) => [
    { slug: node.slug, label: `${'– '.repeat(depth)}${node.name}` },
    ...flattenGenres(node.children, depth + 1),
  ])
}

function clearHref(query: SearchQuery): string {
  return searchHref({
    ...query,
    genre: undefined,
    language: undefined,
    decade: undefined,
    minRating: undefined,
    sort: 'relevance',
    page: 1,
  })
}

/** Sort sits above the results; a GET form that keeps the query and filters, so it works without JS. */
function SortForm({ query }: { query: SearchQuery }) {
  const c = copy.search
  return (
    <form action="/search" method="get" className="flex items-center gap-2.5">
      <input type="hidden" name="q" value={query.q} />
      {query.genre ? <input type="hidden" name="genre" value={query.genre} /> : null}
      {query.language ? <input type="hidden" name="language" value={query.language} /> : null}
      {query.decade ? <input type="hidden" name="decade" value={query.decade} /> : null}
      {query.minRating ? <input type="hidden" name="minRating" value={query.minRating} /> : null}
      <label htmlFor="results-sort" className="text-sm text-muted-foreground">
        {c.sort}
      </label>
      {/* Keyed by its value: the page stays mounted from one search to the next, and `defaultValue`
          alone would keep showing the last search's choice. The filters below do the same. */}
      <Select key={query.sort} id="results-sort" name="sort" defaultValue={query.sort} compact>
        {SEARCH_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {c.sorts[sort]}
          </option>
        ))}
      </Select>
      <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        {c.applySort}
      </button>
    </form>
  )
}

function Filters({ query, genres }: { query: SearchQuery; genres: GenreNode[] }) {
  const c = copy.search
  return (
    <form
      action="/search"
      method="get"
      aria-label={c.filtersLabel}
      className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6"
    >
      <div className="hidden items-center justify-between lg:flex">
        <h2 className="text-[17px] font-semibold">{c.filtersLabel}</h2>
        <Link to={clearHref(query)} className="text-sm text-link hover:underline">
          {c.clearAll}
        </Link>
      </div>
      <input type="hidden" name="q" value={query.q} />
      <input type="hidden" name="sort" value={query.sort} />
      <div className="flex flex-col gap-2.5">
        <Label className="text-[15px] font-semibold" htmlFor="filter-genre">
          {c.genre}
        </Label>
        <Select
          id="filter-genre"
          name="genre"
          key={String(query.genre ?? '')}
          defaultValue={query.genre ?? ''}
          className="w-full font-medium"
        >
          <option value="">{c.anyOption}</option>
          {flattenGenres(genres).map((genre) => (
            <option key={genre.slug} value={genre.slug}>
              {genre.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2.5">
        <Label className="text-[15px] font-semibold" htmlFor="filter-language">
          {c.language}
        </Label>
        <Select
          id="filter-language"
          name="language"
          key={String(query.language ?? '')}
          defaultValue={query.language ?? ''}
          className="w-full font-medium"
        >
          <option value="">{c.anyOption}</option>
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2.5">
        <Label className="text-[15px] font-semibold" htmlFor="filter-decade">
          {c.decade}
        </Label>
        <Select
          id="filter-decade"
          name="decade"
          key={String(query.decade ?? '')}
          defaultValue={query.decade ?? ''}
          className="w-full font-medium"
        >
          <option value="">{c.anyOption}</option>
          {DECADES.map((year) => (
            <option key={year} value={year}>
              {c.decadeOption(year)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2.5">
        <Label className="text-[15px] font-semibold" htmlFor="filter-min-rating">
          {c.minRating}
        </Label>
        <Select
          id="filter-min-rating"
          name="minRating"
          key={String(query.minRating ?? '')}
          defaultValue={query.minRating ?? ''}
          className="w-full font-medium"
        >
          <option value="">{c.anyOption}</option>
          {RATINGS.map((stars) => (
            <option key={stars} value={stars}>
              {c.minRatingOption(stars)}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit">{c.apply}</Button>
      <Link to={clearHref(query)} className="text-sm text-link underline lg:hidden">
        {c.clear}
      </Link>
      <p className="border-t border-border pt-4 text-[13px] leading-normal text-muted-foreground">
        {c.catalogOnly}
      </p>
    </form>
  )
}

/**
 * Filters sit in a disclosure below `lg` and in the left panel from `lg`; the one form is opened on
 * wide screens so there is never a second copy of the fields.
 */
function FilterPanel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const wide = window.matchMedia?.('(min-width: 1024px)')
    if (!wide) return
    const sync = () => {
      if (ref.current && wide.matches) ref.current.open = true
    }
    sync()
    wide.addEventListener('change', sync)
    return () => wide.removeEventListener('change', sync)
  }, [])
  return (
    <details ref={ref} className="group lg:[&::details-content]:[content-visibility:visible]">
      <summary
        className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer list-none lg:hidden')}
      >
        {copy.search.filtersToggle}
      </summary>
      <div className="mt-2 lg:mt-0">{children}</div>
    </details>
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
          className={buttonVariants({ variant: 'outline' })}
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
          className={buttonVariants({ variant: 'outline' })}
        >
          {c.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

const trackResultClick = () => trackEvent(ANALYTICS_EVENTS.searchResultClick)

function Results({ results, signedIn }: { results: SearchResponse; signedIn: boolean }) {
  return (
    <ul className="flex flex-col border-t border-border">
      {results.items.map((item) => {
        if (item.kind === 'book') {
          return (
            <li key={`book-${item.book.id}`}>
              <SearchResultCard
                book={fromSummary(item.book, item.topReview)}
                href={`/books/${item.book.slug}`}
                onNavigate={() => {
                  trackResultClick()
                  sendReached(item.book.slug)
                }}
                shelf={<BookShelfSelector book={item.book} signedIn={signedIn} variant="outline" />}
              />
            </li>
          )
        }
        if (item.kind === 'candidate') {
          return (
            <li key={`candidate-${item.candidate.ref}`}>
              <SearchResultCard
                book={fromCandidate(item.candidate)}
                href={resolveHref(item.candidate.ref)}
                onNavigate={trackResultClick}
                shelf={
                  <ShelfSelector
                    target={{ kind: 'candidate', ref: item.candidate.ref }}
                    title={item.candidate.title}
                    signedIn={signedIn}
                    variant="outline"
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
              className="flex items-center gap-4 border-b border-border py-4 font-serif text-[22px] font-medium text-foreground hover:underline"
            >
              <InitialsAvatar name={item.author.name} colorKey={item.author.slug} size="md" />
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
  authorMatch = null,
}: {
  query: SearchQuery
  results: SearchResponse | null
  failed: boolean
  genres?: GenreNode[]
  viewer?: Viewer | null
  authorMatch?: AuthorSuggestion | null
}) {
  const c = copy.search
  return (
    <section className="flex flex-col gap-7 pb-16">
      <PageHero
        trail={[{ label: c.heading }]}
        title={query.q ? c.headingFor(query.q) : c.heading}
        tabs={<Tabs query={query} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
        {query.type === 'books' ? (
          <aside aria-label={c.filtersLabel}>
            <FilterPanel>
              <Filters query={query} genres={genres} />
            </FilterPanel>
          </aside>
        ) : null}
        <div
          className={`flex min-w-0 flex-col gap-6 ${query.type === 'books' ? '' : 'lg:col-span-2'}`}
        >
          {failed ? (
            <p role="alert" className="text-danger">
              {c.loadFailed}
            </p>
          ) : results === null ? (
            <p className="text-muted-foreground">{c.prompt}</p>
          ) : (
            <>
              {results.sourceUnavailable ? (
                <p
                  role="status"
                  className="rounded-2xl border border-border bg-surface p-4 text-sm"
                >
                  {c.sourceUnavailable}
                </p>
              ) : null}
              {authorMatch ? (
                <AuthorMatchCard name={authorMatch.name} href={`/authors/${authorMatch.slug}`} />
              ) : null}
              {results.items.length === 0 ? (
                <p>{c.empty}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p role="status" className="text-[15px] text-muted-foreground">
                      {query.type === 'books'
                        ? c.resultSplit(
                            results.items.filter((item) => item.kind === 'book').length,
                            results.items.filter((item) => item.kind === 'candidate').length,
                          )
                        : c.resultCount(results.items.length)}
                    </p>
                    {query.type === 'books' ? <SortForm query={query} /> : null}
                  </div>
                  <Results results={results} signedIn={viewer !== null} />
                </>
              )}
              <Pagination query={query} hasMore={results.hasMore} />
              {query.type === 'books' ? (
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-dashed border-dashed-border px-6 py-5">
                  <span className="font-semibold">{c.isbnHint}</span>
                  <span className="text-[15px] text-muted-foreground">{c.isbnHintNote}</span>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
