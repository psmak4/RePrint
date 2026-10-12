import { cn } from '@reprint/ui'
import type { ReactNode } from 'react'
import { copy } from '../../copy/index.js'

/** A horizontally scrolling wrapper for a wide table that keyboard users can focus and scroll. */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string
  /** Inside a card that already draws the frame: `rounded-none border-0`. */
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={copy.admin.scrollableTable(label)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (axe scrollable-region-focusable)
      tabIndex={0}
      // `relative` keeps absolutely placed children (sr-only text) inside the scroll box, so they
      // never widen the page.
      className={cn(
        'relative overflow-x-auto rounded-[18px] border border-border bg-surface',
        className,
      )}
    >
      {children}
    </section>
  )
}
