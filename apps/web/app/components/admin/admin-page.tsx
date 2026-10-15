import { cn, textStyles } from '@reprint/ui'
import type { ReactNode } from 'react'
import { NavLink, useOutletContext } from 'react-router'
import { adminCopy } from '../../copy/admin.js'
import { PageHero } from '../books/page-hero.js'
import { AdminIcon, type AdminIconName } from './icons.js'

export type AdminNavItem = { to: string; label: string; icon: AdminIconName; count?: number }
export type AdminNavGroup = { label: string; items: AdminNavItem[] }
export type AdminCrumb = { label: string; to?: string }

/** The grouped nav the `/admin` layout passes down; null outside it (component tests). */
export function useAdminNav(): AdminNavGroup[] | null {
  return useOutletContext<AdminNavGroup[] | undefined>() ?? null
}

function NavLinks({ groups }: { groups: AdminNavGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className={cn(textStyles.eyebrow, 'text-muted-foreground px-3 pb-1.5')}>
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  // Exact matches, so Catalog is not marked on Genres and rules; a user's page
                  // still marks Users.
                  end={item.to !== '/admin/users'}
                  className="group flex h-10 items-center gap-3 rounded-[10px] border border-transparent px-3 text-[15px] font-medium text-foreground hover:bg-surface-raised aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                >
                  <AdminIcon
                    name={item.icon}
                    className="text-muted-foreground group-aria-[current=page]:text-accent"
                  />
                  {item.label}
                  {item.count ? (
                    <span className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                      <span aria-hidden="true">{item.count}</span>
                      <span className="sr-only">{`, ${adminCopy.navCount(item.count)}`}</span>
                    </span>
                  ) : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The left nav from `lg`; a disclosure above the page below it. */
function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  return (
    <nav aria-label={adminCopy.navLabel} className="lg:w-56 lg:shrink-0">
      <details className="rounded-2xl border border-border bg-surface lg:hidden">
        <summary className="flex h-12 cursor-pointer items-center justify-between gap-2 px-4 text-[15px] font-semibold">
          {adminCopy.navToggle}
          <AdminIcon name="chevronDown" />
        </summary>
        <div className="p-2 pt-0">
          <NavLinks groups={groups} />
        </div>
      </details>
      <div className="hidden lg:block">
        <NavLinks groups={groups} />
      </div>
    </nav>
  )
}

/**
 * One admin page: the shared band (`PageHero`: the trail from Discover through Administration, the
 * `h1`, lead, actions, and `below` for tabs), then the grouped nav beside the content from `lg`
 * (DESIGN.md, D-201, D-214).
 */
export function AdminPage({
  title,
  lead,
  crumbs,
  leading,
  actions,
  below,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  /** The trail after Discover, from Administration to this page. */
  crumbs: AdminCrumb[]
  /** Beside the title: an avatar or a cover. */
  leading?: ReactNode
  actions?: ReactNode
  /** Under the title row, inside the band: tabs. */
  below?: ReactNode
  children: ReactNode
}) {
  const nav = useAdminNav()
  // The dashboard needs reviews.moderate; a viewer without it gets their first section instead.
  const home = nav?.flatMap((group) => group.items).map((item) => item.to)
  const root = home && !home.includes('/admin') ? home[0] : undefined
  const shownCrumbs = crumbs.map((crumb) =>
    crumb.to === '/admin' && root ? { ...crumb, to: root } : crumb,
  )
  return (
    <div className="flex flex-col gap-8">
      <PageHero
        trail={shownCrumbs}
        title={title}
        lead={lead}
        leading={leading}
        actions={actions}
        tabs={below}
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {nav ? <AdminNav groups={nav} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
