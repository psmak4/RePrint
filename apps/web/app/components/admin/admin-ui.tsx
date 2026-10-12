import type { AdminUserStatus } from '@reprint/shared'
import { Button, cn } from '@reprint/ui'
import { type ReactNode, useId } from 'react'
import { AdminIcon } from './icons.js'

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'

const TONES: Record<BadgeTone, string> = {
  green: 'border-[#a7f3d0] bg-[#ecfdf3] text-success',
  amber: 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
  red: 'border-[#fecaca] bg-[#fef2f2] text-danger',
  blue: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]',
  gray: 'border-border bg-surface-raised text-[#334155]',
}

/** A small pill for a status, a role, a count, or an age. */
export function Badge({
  tone = 'gray',
  dot = false,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
      )}
    >
      {dot ? <span aria-hidden="true" className="size-[7px] rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export const USER_STATUS_TONE: Record<AdminUserStatus, BadgeTone> = {
  active: 'green',
  unverified: 'amber',
  suspended: 'red',
  deleted: 'gray',
}

/** A white card. With `title` it is a region named by its serif `h2`. `flush` drops the padding (tables). */
export function AdminCard({
  title,
  label,
  actions,
  flush = false,
  className,
  children,
}: {
  title?: ReactNode
  /** Names the region when there is no visible title. */
  label?: string
  actions?: ReactNode
  flush?: boolean
  className?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-[18px] border border-border bg-surface',
        flush ? 'gap-0 overflow-hidden' : 'p-5 md:p-6',
        className,
      )}
    >
      {title ? (
        <div
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-3',
            flush && 'px-5 pt-5 pb-4',
          )}
        >
          <h2 id={titleId} className="font-serif text-[22px] leading-tight font-medium">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** One number with its label (a `dt` and `dd`s), for use inside a `dl`. Never the serif. */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#ece8e0] bg-[#fdfcfa] px-4 py-3.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[28px] leading-none font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </dd>
      {note ? <dd className="text-[13px] text-muted-foreground">{note}</dd> : null}
    </div>
  )
}

/** A dashed box with a green check and one sentence, and optionally one action. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[18px] border border-dashed border-[#d9d4ca] bg-[#fdfcfa] p-5 sm:flex-row sm:items-center">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#ecfdf3] text-success">
        <AdminIcon name="check" />
      </span>
      <p className="flex-1 text-[15px] text-[#334155]">{children}</p>
      {action}
    </div>
  )
}

/**
 * The full-width button that shows or hides a filter form on phones; from `md` the form is always
 * shown. Pair it with `filtersFormClass` on the form it `controls`.
 */
export function FiltersToggle({
  open,
  onToggle,
  controls,
  label,
}: {
  open: boolean
  onToggle: () => void
  controls: string
  label: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-between md:hidden"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className="inline-flex items-center gap-2.5">
        <AdminIcon name="filter" />
        {label}
      </span>
      <AdminIcon name="chevronDown" />
    </Button>
  )
}

/** A filter form's card: hidden on phones until its `FiltersToggle` opens it. */
export const filtersFormClass = (open: boolean) =>
  cn(
    'flex-col gap-4 rounded-[18px] border border-border bg-surface p-5 md:flex',
    open ? 'flex' : 'hidden',
  )

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-[#d9d4ca] bg-surface px-1.5 font-sans text-xs font-semibold text-[#1e293b]">
      {children}
    </kbd>
  )
}

export const tableClass =
  'w-full border-collapse text-left text-[15px] [&_tbody_tr:last-child>*]:border-b-0'
export const thClass =
  'border-b border-border bg-[#f7f5f0] px-4 py-3 text-xs font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase'
export const tdClass = 'border-b border-[#ece8e0] px-4 py-3 align-middle'
export const numClass = 'text-right tabular-nums'
