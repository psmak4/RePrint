import { buttonVariants, cn, textStyles } from '@reprint/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Breadcrumb, type Crumb } from '../common/breadcrumb.js'

/**
 * The warm band that opens every page but Discover, the Book page, and the auth card (D-214): the
 * breadcrumb trail from Discover, an optional label above the serif title, a lead, actions on the
 * right, anything the page adds (chips, totals), and tabs on its bottom edge. The band reaches the
 * viewport edges with a box-shadow, so the page never scrolls sideways.
 */
export function PageHero({
  trail,
  label,
  title,
  lead,
  leading,
  actions,
  tabs,
  children,
}: {
  /** The steps after Discover, ending with the current page (no `to`). */
  trail: Crumb[]
  /** A small type label above the title, such as "Author". */
  label?: ReactNode
  title: ReactNode
  lead?: ReactNode
  /** Something beside the title, such as an avatar or a cover. */
  leading?: ReactNode
  /** The page's main actions, on the right of the title. */
  actions?: ReactNode
  /** A `TabNav`, drawn on the band's bottom edge. */
  tabs?: ReactNode
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        '-mt-8 flex flex-col gap-5 border-b border-border bg-ground-deep pt-6 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:gap-6 md:pt-8',
        tabs ? 'pb-0' : 'pb-9 md:pb-12',
      )}
    >
      <Breadcrumb trail={trail} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4 md:gap-6">
          {leading}
          <div className="flex min-w-0 flex-col gap-2.5">
            {label ? (
              <p className={cn(textStyles.eyebrow, 'text-muted-foreground')}>{label}</p>
            ) : null}
            <h1 className={textStyles.pageTitle}>{title}</h1>
            {lead ? (
              <div className="max-w-[640px] text-base leading-[1.55] text-strong md:text-lg">
                {lead}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
      {children}
      {tabs}
    </div>
  )
}

/** Previous and next as pills, with the page number between. */
export function PagerLinks({
  label,
  previous,
  next,
  status,
}: {
  label: string
  previous: { href: string; text: string } | null
  next: { href: string; text: string } | null
  status: string
}) {
  const pill = buttonVariants({ variant: 'outline' })
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-4">
      {previous ? (
        <Link rel="prev" to={previous.href} className={pill}>
          {previous.text}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">{status}</span>
      {next ? (
        <Link rel="next" to={next.href} className={pill}>
          {next.text}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
