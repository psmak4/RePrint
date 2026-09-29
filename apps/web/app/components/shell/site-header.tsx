import type { ReactNode } from 'react'
import { copy } from '../../copy/index.js'

export function SiteHeader({
  searchSlot,
  accountSlot,
}: {
  searchSlot?: ReactNode
  accountSlot?: ReactNode
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <a
          href="/"
          aria-label={copy.shell.homeLinkLabel}
          className="text-xl font-semibold text-foreground"
        >
          {copy.shell.brand}
        </a>
        <search
          aria-label={copy.shell.searchLabel}
          className="order-last w-full md:order-none md:w-auto md:flex-1"
        >
          {searchSlot}
        </search>
        <nav aria-label={copy.shell.accountLabel} className="ml-auto flex items-center gap-2">
          {accountSlot}
        </nav>
      </div>
    </header>
  )
}
