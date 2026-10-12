import { cn } from '@reprint/ui'
import type { ReactNode } from 'react'
import { Link, NavLink, useOutletContext } from 'react-router'
import { copy } from '../../copy/index.js'
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
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  className="group flex h-10 items-center gap-3 rounded-[10px] border border-transparent px-3 text-[15px] font-medium text-[#1e293b] hover:bg-surface-raised aria-[current=page]:border-border aria-[current=page]:bg-surface aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                >
                  <AdminIcon
                    name={item.icon}
                    className="text-[#64748b] group-aria-[current=page]:text-accent"
                  />
                  {item.label}
                  {item.count ? (
                    <span className="ml-auto inline-flex h-[22px] min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground">
                      <span aria-hidden="true">{item.count}</span>
                      <span className="sr-only">{`, ${copy.admin.navCount(item.count)}`}</span>
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
    <nav aria-label={copy.admin.navLabel} className="lg:w-60 lg:shrink-0">
      <details className="rounded-xl border border-border bg-surface lg:hidden">
        <summary className="flex h-12 cursor-pointer items-center justify-between gap-2 px-4 text-[15px] font-semibold">
          {copy.admin.navToggle}
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

function Crumbs({ crumbs }: { crumbs: AdminCrumb[] }) {
  return (
    <nav aria-label={copy.admin.breadcrumbLabel}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-foreground hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="break-all">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * One admin page: the warm band (breadcrumb or eyebrow, `h1`, lead, actions, and `below` for tabs),
 * then the grouped nav beside the content from `lg` (DESIGN.md, D-201).
 */
export function AdminPage({
  title,
  lead,
  eyebrow,
  crumbs,
  leading,
  actions,
  below,
  children,
}: {
  title: ReactNode
  lead?: ReactNode
  eyebrow?: string
  crumbs?: AdminCrumb[]
  /** Beside the title: an avatar or a cover. */
  leading?: ReactNode
  actions?: ReactNode
  /** Under the title row, inside the band: tabs. */
  below?: ReactNode
  children: ReactNode
}) {
  const nav = useAdminNav()
  return (
    <div className="flex flex-col gap-8">
      <div
        className={cn(
          '-mt-8 flex flex-col gap-5 border-b border-border bg-ground-deep pt-7 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:pt-9',
          below ? 'pb-0' : 'pb-8 md:pb-9',
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-2.5">
            {crumbs ? <Crumbs crumbs={crumbs} /> : null}
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex items-center gap-4 md:gap-5">
              {leading}
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="font-serif text-[34px] leading-[1.05] font-medium tracking-[-0.02em] break-words md:text-[44px]">
                  {title}
                </h1>
                {lead ? (
                  <div className="max-w-[640px] text-base leading-[1.5] text-muted-foreground">
                    {lead}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
        </div>
        {below}
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        {nav ? <AdminNav groups={nav} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-6">{children}</div>
      </div>
    </div>
  )
}
