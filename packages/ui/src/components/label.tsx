import type * as React from 'react'
import { cn } from '../lib/utils.js'

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap a control
    <label className={cn('text-sm font-medium text-foreground', className)} {...props} />
  )
}
