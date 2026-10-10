import type { ReactNode } from 'react'
import { copy } from '../../copy/index.js'

/** The RePrint wordmark: serif "Re" with "Print" in the accent italic. */
export function Wordmark({ className = 'text-[28px]' }: { className?: string }) {
  return (
    <a
      href="/"
      aria-label={copy.shell.homeLinkLabel}
      className={`font-serif leading-none font-semibold tracking-[-0.01em] text-foreground ${className}`}
    >
      {copy.shell.brandStart}
      <span className="font-medium text-accent italic">{copy.shell.brandEnd}</span>
    </a>
  )
}

export function SiteHeader({
  navSlot,
  searchSlot,
  accountSlot,
}: {
  navSlot?: ReactNode
  searchSlot?: ReactNode
  accountSlot?: ReactNode
}) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 md:min-h-[76px] md:flex-nowrap md:gap-x-8 md:py-2">
        <Wordmark />
        {navSlot}
        <search
          aria-label={copy.shell.searchLabel}
          className="order-last w-full md:order-none md:ml-auto md:w-auto md:max-w-[520px] md:flex-1"
        >
          {searchSlot}
        </search>
        <nav
          aria-label={copy.shell.accountLabel}
          className="ml-auto flex items-center gap-1 sm:gap-2 md:ml-0"
        >
          {accountSlot}
        </nav>
      </div>
    </header>
  )
}
