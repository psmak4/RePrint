import {
  type AdminBookSearchResponse,
  type AdminCatalogStats,
  SEARCH_MIN_LENGTH,
} from '@reprint/shared'
import { Button, Input, Label } from '@reprint/ui'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'
import { PagerLinks } from '../books/page-hero.js'
import { ScrollRegion } from './scroll-region.js'

const text = copy.admin.catalog

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const numberFormat = new Intl.NumberFormat('en-US')

function monthLabel(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`))
}

export interface CatalogSearch {
  q: string
  page: number
  /** `null` before a search; `'failed'` when the API could not answer. */
  results: AdminBookSearchResponse | 'failed' | null
}

const searchHref = (q: string, page: number) =>
  `/admin/catalog?${new URLSearchParams(page > 1 ? { q, page: String(page) } : { q })}`

/** Finds a Book already on RePrint and links to its admin page (PRD §7.11). A plain GET form. */
function BookSearch({ search }: { search: CatalogSearch }) {
  const { q, page, results } = search
  return (
    <section aria-labelledby="book-search-heading" className="flex flex-col gap-4">
      <h3 id="book-search-heading" className="font-serif text-xl font-medium">
        {text.searchHeading}
      </h3>
      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <Label htmlFor="book-search-q">{text.searchLabel}</Label>
          <Input
            id="book-search-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            aria-describedby="book-search-hint"
          />
        </div>
        <Button type="submit">{text.searchButton}</Button>
        <p id="book-search-hint" className="w-full text-sm text-muted-foreground">
          {text.searchHint}
        </p>
      </Form>
      {results === null ? null : results === 'failed' ? (
        <p role="alert" className="text-sm">
          {text.searchFailed}
        </p>
      ) : q.length < SEARCH_MIN_LENGTH ? (
        <p className="text-sm text-muted-foreground">{text.tooShort}</p>
      ) : results.items.length === 0 ? (
        <p className="text-muted-foreground">{text.noResults(q)}</p>
      ) : (
        <>
          <ul aria-label={text.resultsLabel(q)} className="flex flex-col">
            {results.items.map((book) => {
              const authors = book.contributions
                .filter((c) => c.role === 'author' || c.role === 'co_author')
                .map((c) => c.author.name)
              return (
                <li
                  key={book.id}
                  className="flex items-center gap-4 border-b border-border py-3 last:border-b-0"
                >
                  <Cover
                    cover={book.cover}
                    title={book.title}
                    authorName={authors[0]}
                    slug={book.slug}
                    size="small"
                    className="w-11"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Link
                      to={`/admin/books/${book.id}`}
                      className="font-serif text-lg leading-snug font-medium break-words underline underline-offset-2"
                    >
                      {book.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {[authors.join(', '), book.firstPublishedYear].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Link to={`/books/${book.slug}`} className="shrink-0 text-sm text-link underline">
                    {text.publicPage}
                  </Link>
                </li>
              )
            })}
          </ul>
          {page > 1 || results.hasMore ? (
            <PagerLinks
              label={text.pagerLabel}
              previous={page > 1 ? { href: searchHref(q, page - 1), text: text.previous } : null}
              next={results.hasMore ? { href: searchHref(q, page + 1), text: text.next } : null}
              status={text.pageStatus(page)}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

/** Catalog size, what was added each month, and a search for a Book to edit (PRD §6, §7.11). */
export function CatalogDashboard({
  stats,
  search = { q: '', page: 1, results: null },
}: {
  stats: AdminCatalogStats
  search?: CatalogSearch
}) {
  const grew = stats.monthly.some((row) => row.books + row.editions + row.authors > 0)
  return (
    <section aria-labelledby="catalog-heading" className="flex flex-col gap-6">
      <h2
        id="catalog-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <BookSearch search={search} />
      <dl aria-label={text.totalsLabel} className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ['books', text.books],
            ['editions', text.editions],
            ['authors', text.authors],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-2xl border border-border bg-surface p-5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-2 font-serif text-[40px] leading-none font-medium">
              {numberFormat.format(stats.totals[key])}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="growth-heading" className="flex flex-col gap-3">
        <h3 id="growth-heading" className="font-serif text-2xl leading-tight font-medium">
          {text.growthHeading}
        </h3>
        {grew ? (
          <ScrollRegion label={text.growthHeading}>
            <table className="w-full text-left text-sm">
              <caption className="pb-2 text-left text-muted-foreground">
                {text.growthCaption}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-3 pr-4 font-semibold">
                    {text.month}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">
                    {text.books}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">
                    {text.editions}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {text.authors}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.monthly.map((row) => (
                  <tr key={row.month} className="border-b border-border">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <time dateTime={row.month}>{monthLabel(row.month)}</time>
                    </th>
                    <td className="py-3 pr-4 text-right">{numberFormat.format(row.books)}</td>
                    <td className="py-3 pr-4 text-right">{numberFormat.format(row.editions)}</td>
                    <td className="py-2 text-right">{numberFormat.format(row.authors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <p className="text-muted-foreground">{text.noGrowth}</p>
        )}
      </section>
      <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link to="/admin/catalog/merge" className="underline">
          {text.mergeLink}
        </Link>
        <Link to="/admin/catalog/genres" className="underline">
          {text.genresLink}
        </Link>
      </p>
    </section>
  )
}
