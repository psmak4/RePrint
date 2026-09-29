import type * as React from 'react'
import { cn } from '../lib/utils.js'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-input-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}
