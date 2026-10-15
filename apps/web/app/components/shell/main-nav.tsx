import type { Viewer } from '@reprint/shared'
import { buttonVariants } from '@reprint/ui'
import { NavLink } from 'react-router'
import { copy } from '../../copy/index.js'
import { Menu, menuItemClass } from '../common/menu.js'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 py-2 text-[15px] font-medium hover:text-foreground ${
    isActive ? 'border-accent text-foreground' : 'border-transparent text-strong'
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
      <Menu
        className="order-1 md:hidden"
        label={copy.shell.menuLabel}
        button={
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
        }
        buttonClassName={buttonVariants({ variant: 'ghost', size: 'icon' })}
        panelClassName="w-56"
      >
        <nav aria-label={copy.shell.mainNavLabel} className="flex flex-col">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={menuItemClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </Menu>
    </>
  )
}
