import { LIBRARY_SORTS, type LibraryResponse, type Shelf, type Viewer } from '@reprint/shared'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type LibraryView, libraryHref } from '../../lib/library-links.js'
import { BookCard } from '../books/book-card.js'
import { summaryCard } from '../books/genre-pages.js'
import { BookShelfSelector } from '../books/shelf-selector.js'

const text = copy.library

const TABS: ReadonlyArray<{ shelf: Shelf | undefined; key: keyof typeof text.tabs }> = [
  { shelf: undefined, key: 'all' },
  { shelf: 'reading', key: 'reading' },
  { shelf: 'want_to_read', key: 'want_to_read' },
  { shelf: 'read', key: 'read' },
]

function Tabs({
  username,
  view,
  counts,
}: {
  username: string
  view: LibraryView
  counts: LibraryResponse['counts']
}) {
  return (
    <nav aria-label={text.tabsLabel} className="flex flex-wrap gap-2 border-b border-border">
      {TABS.map((tab) => {
        const current = view.shelf === tab.shelf
        return (
          <Link
            key={tab.key}
            to={libraryHref(username, view, { shelf: tab.shelf, page: 1 })}
            aria-current={current ? 'page' : undefined}
            className={
              current
                ? 'border-b-2 border-primary px-3 py-2 font-semibold'
                : 'px-3 py-2 text-muted-foreground hover:text-foreground'
            }
          >
            {text.tabLabel(text.tabs[tab.key], counts[tab.key])}
          </Link>
        )
      })}
    </nav>
  )
}

function SortForm({ username, view }: { username: string; view: LibraryView }) {
  // A plain GET form, so sorting works without JavaScript; the Shelf tab is kept and the page resets.
  return (
    <Form method="get" action={`/u/${username}/library`} className="flex flex-wrap items-end gap-3">
      {view.shelf ? <input type="hidden" name="shelf" value={view.shelf} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        {text.sortLabel}
        <select
          name="sort"
          defaultValue={view.sort}
          className="rounded-md border border-input-border bg-background px-2 py-1.5"
        >
          {LIBRARY_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {text.sorts[sort]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md border border-input-border px-3 py-1.5 text-sm hover:bg-surface"
      >
        {text.apply}
      </button>
    </Form>
  )
}

function Pagination({
  username,
  view,
  totalPages,
}: {
  username: string
  view: LibraryView
  totalPages: number
}) {
  if (totalPages <= 1) return null
  return (
    <nav aria-label={text.pagesLabel} className="flex items-center justify-between">
      {view.page > 1 ? (
        <Link
          rel="prev"
          to={libraryHref(username, view, { page: view.page - 1 })}
          className="text-link underline"
        >
          {text.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{text.pageOf(view.page, totalPages)}</span>
      {view.page < totalPages ? (
        <Link
          rel="next"
          to={libraryHref(username, view, { page: view.page + 1 })}
          className="text-link underline"
        >
          {text.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

/** Shown to everyone but the owner when the Library is private (or the account does not exist; D-141). */
export function PrivateLibrary() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold">{text.privateHeading}</h1>
      <p className="text-muted-foreground">{text.privateBody}</p>
    </div>
  )
}

/** `/u/:username/library`: Shelf tabs with counts, sort, and pages in the URL (PRD §7.7). */
export function LibraryPage({
  username,
  library,
  view,
  viewer = null,
}: {
  username: string
  library: LibraryResponse
  view: LibraryView
  viewer?: Viewer | null
}) {
  const isOwner = viewer !== null && viewer.username.toLowerCase() === username.toLowerCase()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">
        {isOwner ? text.ownHeading : text.heading(username)}
      </h1>
      <Tabs username={username} view={view} counts={library.counts} />
      <SortForm username={username} view={view} />
      {library.items.length === 0 ? (
        <p className="text-muted-foreground">
          {text.empty}{' '}
          <Link to="/" className="text-link underline">
            {text.discoverPrompt}
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library.items.map(({ shelf, book }) => (
            <li key={book.id}>
              <BookCard
                book={summaryCard(book)}
                href={`/books/${book.slug}`}
                shelf={
                  isOwner ? (
                    <BookShelfSelector book={{ ...book, viewerShelf: shelf }} signedIn />
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination username={username} view={view} totalPages={library.meta.totalPages} />
    </div>
  )
}
