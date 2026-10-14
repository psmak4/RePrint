import { LIBRARY_SORTS, type LibraryResponse, type Shelf, type Viewer } from '@reprint/shared'
import { buttonVariants, cn, Select, textStyles } from '@reprint/ui'
import { useId } from 'react'
import { Form, Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type LibraryView, libraryHref } from '../../lib/library-links.js'
import { InitialsAvatar } from '../books/avatar.js'
import { BookGrid } from '../books/book-tile.js'
import { summaryCard } from '../books/genre-pages.js'
import { PageHero, PagerLinks } from '../books/page-hero.js'
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
    <nav
      aria-label={text.tabsLabel}
      className="flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none] md:gap-7"
    >
      {TABS.map((tab) => {
        const current = view.shelf === tab.shelf
        return (
          <Link
            key={tab.key}
            to={libraryHref(username, view, { shelf: tab.shelf, page: 1 })}
            aria-current={current ? 'page' : undefined}
            aria-label={text.tabLabel(text.tabs[tab.key], counts[tab.key])}
            className={`-mb-px inline-flex h-[52px] shrink-0 items-center gap-2 border-b-2 text-base font-medium whitespace-nowrap ${
              current
                ? 'border-accent text-foreground'
                : 'border-transparent text-strong hover:text-foreground'
            }`}
          >
            {text.tabs[tab.key]}
            <span className="rounded-full bg-track px-2 py-0.5 text-xs font-semibold text-strong">
              {counts[tab.key]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function SortForm({ username, view }: { username: string; view: LibraryView }) {
  const sortId = useId()
  // A plain GET form, so sorting works without JavaScript; the Shelf tab is kept and the page resets.
  return (
    <Form method="get" action={`/u/${username}/library`} className="flex items-center gap-2.5">
      {view.shelf ? <input type="hidden" name="shelf" value={view.shelf} /> : null}
      <label htmlFor={sortId} className="flex items-center gap-2.5 text-sm text-muted-foreground">
        {text.sortLabel}
        {/* Keyed by its value, so Back or a new link shows that URL's sort, not the last one. */}
        <Select key={view.sort} id={sortId} name="sort" defaultValue={view.sort} compact>
          {LIBRARY_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {text.sorts[sort]}
            </option>
          ))}
        </Select>
      </label>
      <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
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
    <PagerLinks
      label={text.pagesLabel}
      previous={
        view.page > 1
          ? { href: libraryHref(username, view, { page: view.page - 1 }), text: text.previous }
          : null
      }
      next={
        view.page < totalPages
          ? { href: libraryHref(username, view, { page: view.page + 1 }), text: text.next }
          : null
      }
      status={text.pageOf(view.page, totalPages)}
    />
  )
}

/** Shown to everyone but the owner when the Library is private (or the account does not exist; D-141). */
export function PrivateLibrary() {
  return <PageHero title={text.privateHeading} lead={text.privateBody} />
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
  const total = library.counts.all
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero
        eyebrow={<p className={cn(textStyles.eyebrow, 'text-muted-foreground')}>{text.eyebrow}</p>}
        leading={
          <InitialsAvatar
            name={username}
            size="xl"
            className="size-16 text-2xl md:size-[88px] md:text-[32px]"
          />
        }
        title={isOwner ? text.ownHeading : text.heading(username)}
        lead={isOwner ? text.ownShelfCount(total) : text.shelfCount(total)}
      />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <Tabs username={username} view={view} counts={library.counts} />
          <SortForm username={username} view={view} />
        </div>
        {library.items.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-dashed-border px-6 py-5">
            <p className="text-muted-foreground">{text.empty}</p>
            <Link to="/" className={buttonVariants()}>
              {text.discoverPrompt}
            </Link>
          </div>
        ) : (
          <BookGrid
            items={library.items.map(({ shelf, book }) => ({
              slug: book.slug,
              book: summaryCard(book),
              eyebrow: view.shelf ? undefined : text.tabs[shelf],
              shelf: isOwner ? (
                <BookShelfSelector book={{ ...book, viewerShelf: shelf }} signedIn variant="icon" />
              ) : undefined,
            }))}
          />
        )}
        <Pagination username={username} view={view} totalPages={library.meta.totalPages} />
      </div>
    </div>
  )
}
