import type * as React from 'react'
import { cn } from '../lib/utils.js'

/** A native checkbox, so keyboard and screen reader behavior come for free. */
export function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-5 shrink-0 rounded border border-input-border bg-surface accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
