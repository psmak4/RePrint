import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

export type Tab = {
  label: string
  to: string
  current: boolean
  /** Shown as a count chip when the page knows it. */
  count?: number
}

/** The tab style, shared with the Book page's section nav (D-214). */
export const tabClass =
  '-mb-px inline-flex h-[52px] shrink-0 items-center gap-2 border-b-2 text-base font-medium whitespace-nowrap'
export const tabStateClass = (current: boolean) =>
  current ? 'border-accent text-foreground' : 'border-transparent text-strong hover:text-foreground'

/** A number beside a tab's label: the badge-count size (DESIGN.md). */
export function TabCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full bg-track px-2 py-0.5 text-xs font-semibold text-strong"
    >
      {count}
    </span>
  )
}

/**
 * Underlined tabs that sit on the band's bottom edge (Settings, admin Genres, Library, profile,
 * search). Each tab is a link; the current one carries `aria-current="page"`.
 */
export function TabNav({ label, tabs }: { label: string; tabs: Tab[] }) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
    >
      <div className="flex gap-7">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={tab.current ? 'page' : undefined}
            aria-label={
              tab.count === undefined ? undefined : copy.shell.tabWithCount(tab.label, tab.count)
            }
            className={`${tabClass} ${tabStateClass(tab.current)}`}
          >
            {tab.label}
            {tab.count === undefined ? null : <TabCount count={tab.count} />}
          </Link>
        ))}
      </div>
    </nav>
  )
}
