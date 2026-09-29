import type { ReactNode } from 'react'
import { copy } from '../../copy/index.js'
import { SiteFooter } from './site-footer.js'
import { SiteHeader } from './site-header.js'

export interface AppShellProps {
  searchSlot?: ReactNode
  accountSlot?: ReactNode
  children: ReactNode
}

export function AppShell({ searchSlot, accountSlot, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground"
      >
        {copy.shell.skipToContent}
      </a>
      <SiteHeader searchSlot={searchSlot} accountSlot={accountSlot} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
