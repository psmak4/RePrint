import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * The warm band that opens a browse page (Genres, a Genre, a Library): an optional breadcrumb or
 * eyebrow, the serif `h1`, a lead, and anything else the page puts under it. The band reaches the
 * viewport edges with a box-shadow, so the page never scrolls sideways.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  leading,
  children,
}: {
  /** A breadcrumb or small label above the title. */
  eyebrow?: ReactNode
  title: ReactNode
  lead?: ReactNode
  /** Something beside the title, such as an avatar. */
  leading?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="-mt-8 flex flex-col gap-5 border-b border-border bg-ground-deep pt-8 pb-9 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:gap-6 md:pt-12 md:pb-14">
      {eyebrow}
      <div className="flex items-center gap-4 md:gap-6">
        {leading}
        <div className="flex min-w-0 flex-col gap-2.5">
          <h1 className="font-serif text-[38px] leading-[1.05] font-medium tracking-[-0.02em] break-words md:text-[56px]">
            {title}
          </h1>
          {lead ? (
            <p className="max-w-[640px] text-base leading-[1.55] text-[#334155] md:text-lg">
              {lead}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  )
}

/** A pill link used for sort and filter choices on browse pages. */
export const choiceClass = (active: boolean) =>
  `inline-flex h-[34px] items-center rounded-full border px-3.5 text-sm font-medium ${
    active
      ? 'border-accent bg-accent text-accent-foreground'
      : 'border-[#d9d4ca] bg-surface text-[#1e293b] hover:border-input-border'
  }`

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
  const pill =
    'inline-flex h-11 items-center rounded-full border border-input-border bg-surface px-5 text-sm font-semibold hover:bg-surface-raised'
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
