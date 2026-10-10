import type { ReactNode } from 'react'
import { copy } from '../../copy/index.js'

/** A horizontally scrolling wrapper for a wide table that keyboard users can focus and scroll. */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={copy.admin.scrollableTable(label)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable (axe scrollable-region-focusable)
      tabIndex={0}
      className="overflow-x-auto rounded-2xl border border-border bg-surface px-5 py-2"
    >
      {children}
    </section>
  )
}
