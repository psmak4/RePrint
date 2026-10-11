import type * as React from 'react'
import { cn } from '../lib/utils.js'

/**
 * A native `<select>` in the RePrint style (D-198): our chevron instead of the browser's, and,
 * where the browser can draw the open list itself (`appearance: base-select`), a menu that matches
 * the site. Elsewhere the open list is the system menu. `compact` is the 40 px toolbar size.
 */
export function Select({
  className,
  compact = false,
  ...props
}: React.ComponentProps<'select'> & { compact?: boolean }) {
  return (
    <select
      data-slot="select"
      className={cn(
        'ui-select ui-select-menu rounded-[10px] border border-input-border bg-surface pr-10 pl-3.5 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
        compact ? 'h-10 text-sm font-medium' : 'h-11 text-[15px]',
        className,
      )}
      {...props}
    />
  )
}
