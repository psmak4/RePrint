import type * as React from 'react'
import { cn } from '../lib/utils.js'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-11 w-full rounded-[10px] border border-input-border bg-surface px-3.5 py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The one file picker look (D-214): the browser's file input with its button drawn as a small
 * outline pill. Used for avatars and covers.
 */
export const fileInputClass =
  'ui-file text-sm text-muted-foreground file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border file:border-input-border file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-foreground hover:file:bg-surface-raised'
