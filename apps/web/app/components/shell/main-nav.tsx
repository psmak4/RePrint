import type { Viewer } from '@reprint/shared'
import { NavLink } from 'react-router'
import { copy } from '../../copy/index.js'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 py-2 text-[15px] font-medium hover:text-foreground ${
    isActive ? 'border-accent text-foreground' : 'border-transparent text-[#334155]'
  }`

const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-11 items-center rounded-lg px-3 text-[15px] font-medium hover:bg-surface-raised ${
    isActive ? 'bg-surface-raised text-foreground' : 'text-[#334155]'
  }`

function links(viewer: Viewer | null) {
  const t = copy.shell.nav
  return [
    { to: '/', label: t.discover, end: true },
    { to: '/genres', label: t.genres, end: false },
    ...(viewer ? [{ to: `/u/${viewer.username}/library`, label: t.library, end: false }] : []),
  ]
}

/**
 * The header's main links: Discover, Genres, and the Member's own library. Inline from `md`; on
 * phones they sit behind a menu button at the end of the top row.
 */
export function MainNav({ viewer }: { viewer: Viewer | null }) {
  const items = links(viewer)
  return (
    <>
      <nav aria-label={copy.shell.mainNavLabel} className="hidden gap-6 md:flex">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <details className="relative order-1 md:hidden">
        <summary
          aria-label={copy.shell.menuLabel}
          className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-surface-raised"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[22px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </summary>
        <nav
          aria-label={copy.shell.mainNavLabel}
          className="absolute right-0 z-40 mt-2 flex w-56 flex-col rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.3)]"
        >
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={menuLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </details>
    </>
  )
}
