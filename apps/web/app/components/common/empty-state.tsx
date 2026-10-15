import { cn } from '@reprint/ui'
import type { ReactNode } from 'react'
import { AdminIcon } from '../admin/icons.js'

/**
 * The one dashed box (D-214): an empty list, a prompt, or a tip. Its text, an optional check for
 * "all caught up" (the admin queues), and an optional action beside it.
 */
export function EmptyState({
  icon,
  action,
  className,
  children,
}: {
  icon?: 'check'
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-dashed border-dashed-border px-6 py-5 sm:flex-row sm:items-center',
        className,
      )}
    >
      {icon === 'check' ? (
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-tint text-success">
          <AdminIcon name="check" />
        </span>
      ) : null}
      <div className="flex-1 text-[15px] text-strong">{children}</div>
      {action}
    </div>
  )
}
