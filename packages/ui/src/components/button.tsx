import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '../lib/utils.js'

/**
 * The one pill for every action (D-188, D-214). Each height has one text size: `sm` 40 / 14 px,
 * `default` 44 / 15 px, `lg` 48 / 16 px; `icon` and `icon-sm` are round 44 and 36 px buttons.
 * `overlay` is the translucent white button that sits on a cover. Links take the look with `asChild`.
 * `ui-button` marks it for the UI consistency spec (e2e/specs/ui-consistency.spec.ts).
 */
export const buttonVariants = cva(
  'ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:bg-accent-hover',
        secondary: 'bg-surface text-foreground hover:bg-surface-raised',
        outline: 'border border-input-border bg-surface text-foreground hover:bg-surface-raised',
        ghost: 'text-foreground hover:bg-surface-raised',
        danger: 'border border-danger bg-surface text-danger hover:bg-danger-tint',
        overlay:
          'bg-[rgba(255,255,255,0.92)] text-foreground shadow-[0_2px_6px_rgba(15,23,42,0.2)] hover:bg-surface',
      },
      size: {
        sm: 'h-10 px-4 text-sm',
        default: 'h-11 px-5 text-[15px]',
        lg: 'h-12 px-7 text-base',
        icon: 'size-11 shrink-0',
        'icon-sm': 'size-9 shrink-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
