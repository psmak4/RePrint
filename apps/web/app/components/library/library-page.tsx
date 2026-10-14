import { LIBRARY_SORTS, type LibraryResponse, type Shelf, type Viewer } from '@reprint/shared'
import { buttonVariants } from '@reprint/ui'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type LibraryView, libraryHref } from '../../lib/library-links.js'
import { InitialsAvatar } from '../books/avatar.js'
import { BookGrid } from '../books/book-tile.js'
import { summaryCard } from '../books/genre-pages.js'
import { PageHero } from '../books/page-hero.js'
import { BookShelfSelector } from '../books/shelf-selector.js'
import { Pager } from '../common/pager.js'
import { SortControl } from '../common/sort-control.js'
import { TabNav } from '../common/tab-nav.js'

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
    <TabNav
      label={text.tabsLabel}
      tabs={TABS.map((tab) => ({
        label: text.tabs[tab.key],
        to: libraryHref(username, view, { shelf: tab.shelf, page: 1 }),
        current: view.shelf === tab.shelf,
        count: counts[tab.key],
      }))}
    />
  )
}

function SortForm({ username, view }: { username: string; view: LibraryView }) {
  // The Shelf tab is kept and the page resets (D-214).
  return (
    <SortControl
      action={`/u/${username}/library`}
      value={view.sort}
      options={LIBRARY_SORTS}
      optionLabel={(sort) => text.sorts[sort]}
      keep={{ shelf: view.shelf }}
    />
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
    <Pager
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
  return (
    <PageHero
      trail={[{ label: text.eyebrow }]}
      title={text.privateHeading}
      lead={text.privateBody}
    />
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
  const total = library.counts.all
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero
        trail={[{ label: username, to: `/u/${username}` }, { label: text.eyebrow }]}
        tabs={<Tabs username={username} view={view} counts={library.counts} />}
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
        <div className="flex justify-end">
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
