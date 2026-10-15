import type { Viewer } from '@reprint/shared'
import { Button, buttonVariants } from '@reprint/ui'
import { Form, NavLink } from 'react-router'
import { copy } from '../../copy/index.js'
import { canOpenAdmin } from '../../lib/admin-area.js'
import { Menu, menuItemClass } from '../common/menu.js'

/**
 * The header account slot: log in and register for Visitors; for Members a menu with their profile,
 * Library, Settings, the admin area when they may open it, and log out (D-214).
 */
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
  const t = copy.shell.account
  const links = [
    { to: `/u/${viewer.username}`, label: t.profile, end: true },
    { to: `/u/${viewer.username}/library`, label: t.library, end: false },
    { to: '/settings', label: t.settings, end: false },
    ...(canOpenAdmin(viewer.permissions) ? [{ to: '/admin', label: t.admin, end: false }] : []),
  ]
  return (
    <Menu
      label={copy.shell.accountMenuLabel}
      button={viewer.displayName}
      buttonClassName={buttonVariants({ variant: 'ghost' })}
    >
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={menuItemClass}>
          {link.label}
        </NavLink>
      ))}
      <div aria-hidden="true" className="mx-3 my-1 border-t border-border" />
      <Form method="post" action="/logout">
        <button type="submit" className={menuItemClass}>
          {copy.shell.logOut}
        </button>
      </Form>
    </Menu>
  )
}
