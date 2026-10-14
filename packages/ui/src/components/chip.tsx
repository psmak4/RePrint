import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils.js'

/**
 * The one chip (D-214): 34 px, 14 px medium, a `chip-border` edge, and an accent fill when
 * `selected`. Genre chips, filters, the Series pill, and choice lists all use it; a link or button
 * takes the look with `asChild` or `chipVariants`. `interactive={false}` drops the hover edge for a
 * chip that only shows a fact.
 */
export const chipVariants = cva(
  'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  {
    variants: {
      selected: {
        true: 'border-accent bg-accent text-accent-foreground',
        false: 'border-chip-border bg-surface text-foreground',
      },
      interactive: { true: '', false: '' },
    },
    compoundVariants: [
      { selected: false, interactive: true, className: 'hover:border-input-border' },
    ],
    defaultVariants: { selected: false, interactive: true },
  },
)

export type ChipProps = React.ComponentProps<'span'> &
  VariantProps<typeof chipVariants> & { asChild?: boolean }

export function Chip({ className, selected, interactive, asChild = false, ...props }: ChipProps) {
  const Comp = asChild ? Slot : 'span'
  return <Comp className={cn(chipVariants({ selected, interactive }), className)} {...props} />
}
