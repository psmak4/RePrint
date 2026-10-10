import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy/index.js'
import { PageHero } from '../books/page-hero.js'

export type AdminNavItem = { to: string; label: string }

/** Shared frame for `/admin/*`: a left nav from `lg`, a disclosure above the page below it (DESIGN.md). */
export function AdminLayout({ items }: { items: AdminNavItem[] }) {
  const links = (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end
            className="flex h-10 items-center rounded-lg px-3 text-[15px] font-medium text-[#334155] hover:bg-surface-raised hover:text-foreground aria-[current=page]:bg-surface aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_0_0_0_1px_var(--color-border)]"
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex flex-col gap-8">
      <PageHero title={copy.admin.title} />
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label={copy.admin.navLabel} className="lg:w-56 lg:shrink-0">
          <details className="rounded-xl border border-border bg-surface lg:hidden">
            <summary className="flex h-11 cursor-pointer items-center px-4 text-sm font-semibold">
              {copy.admin.navToggle}
            </summary>
            <div className="p-2">{links}</div>
          </details>
          <div className="hidden lg:block">{links}</div>
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
