import type * as React from 'react'
import { cn } from '../lib/utils.js'

export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'

const TONES: Record<BadgeTone, string> = {
  green: 'border-success-edge bg-success-tint text-success',
  amber: 'border-warning-edge bg-warning-tint text-warning',
  red: 'border-danger-edge bg-danger-tint text-danger',
  blue: 'border-accent-edge bg-accent-tint text-link',
  gray: 'border-border bg-surface-raised text-strong',
}

/**
 * The one status pill (D-214): 24 px, 12 px semibold, a tinted fill and edge per tone, an optional
 * dot. For a status, a role, an age, or a label such as "This device". `ui-badge` marks it for the
 * UI consistency spec.
 */
export function Badge({
  tone = 'gray',
  dot = false,
  wrap = false,
  className,
  children,
}: {
  tone?: BadgeTone
  dot?: boolean
  /** For free text that may be long: it wraps instead of widening its container. */
  wrap?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'ui-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold',
        wrap ? 'min-h-6 py-0.5 break-words whitespace-normal' : 'h-6 whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className="size-[7px] rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

/**
 * The one count (D-214): 22 px, at least 24 px wide, 12 px semibold. `accent` asks for attention
 * (unread notifications, items waiting in a queue); `neutral` sits beside a tab's label.
 * `ui-count` marks it for the UI consistency spec.
 */
export function CountBadge({
  tone = 'neutral',
  className,
  ...props
}: React.ComponentProps<'span'> & { tone?: 'accent' | 'neutral' }) {
  return (
    <span
      className={cn(
        'ui-count inline-flex h-[22px] min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
        tone === 'accent' ? 'bg-accent text-accent-foreground' : 'bg-track text-strong',
        className,
      )}
      {...props}
    />
  )
}
