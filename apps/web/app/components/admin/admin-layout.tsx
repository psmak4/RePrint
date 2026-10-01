import { NavLink, Outlet } from 'react-router'
import { copy } from '../../copy/index.js'

export type AdminNavItem = { to: string; label: string }

/** Shared frame for `/admin/*`: a left nav from `lg`, a disclosure above the page below it (DESIGN.md). */
export function AdminLayout({ items }: { items: AdminNavItem[] }) {
  const links = (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className="block rounded-md px-3 py-2 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-semibold"
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="py-8">
      <h1 className="text-3xl font-semibold">{copy.admin.title}</h1>
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <nav aria-label={copy.admin.navLabel} className="lg:w-56 lg:shrink-0">
          <details className="rounded-md border border-border lg:hidden">
            <summary className="cursor-pointer px-3 py-2 text-sm">{copy.admin.navToggle}</summary>
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
