import type { Viewer } from '@reprint/shared'
import { Button, buttonVariants, cn } from '@reprint/ui'
import { Form } from 'react-router'
import { copy } from '../../copy/index.js'

/** The header account slot: log in and register for Visitors, a menu with log out for Members. */
export function AccountMenu({ viewer }: { viewer: Viewer | null }) {
  if (!viewer) {
    return (
      <>
        <Button asChild variant="ghost">
          <a href="/login">{copy.shell.logIn}</a>
        </Button>
        <Button asChild className="hidden sm:inline-flex">
          <a href="/register">{copy.shell.register}</a>
        </Button>
      </>
    )
  }
  return (
    <details className="relative">
      <summary
        aria-label={copy.shell.accountMenuLabel}
        className={cn(buttonVariants({ variant: 'ghost' }), 'cursor-pointer list-none')}
      >
        {viewer.displayName}
      </summary>
      <div className="absolute right-0 z-40 mt-2 min-w-40 rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.3)]">
        <Form method="post" action="/logout">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            {copy.shell.logOut}
          </Button>
        </Form>
      </div>
    </details>
  )
}
