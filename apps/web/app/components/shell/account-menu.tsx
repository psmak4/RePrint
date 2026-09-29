import type { Viewer } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { Form } from 'react-router'
import { copy } from '../../copy/index.js'

/** The header account slot: log in and register for Visitors, a menu with log out for Members. */
export function AccountMenu({ viewer }: { viewer: Viewer | null }) {
  if (!viewer) {
    return (
      <>
        <Button asChild variant="ghost" size="sm">
          <a href="/login">{copy.shell.logIn}</a>
        </Button>
        <Button asChild size="sm">
          <a href="/register">{copy.shell.register}</a>
        </Button>
      </>
    )
  }
  return (
    <details className="relative">
      <summary
        aria-label={copy.shell.accountMenuLabel}
        className="flex h-9 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium hover:bg-surface"
      >
        {viewer.displayName}
      </summary>
      <div className="absolute right-0 z-40 mt-2 min-w-40 rounded-md border border-border bg-surface p-1">
        <Form method="post" action="/logout">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            {copy.shell.logOut}
          </Button>
        </Form>
      </div>
    </details>
  )
}
