import type { Viewer } from '@reprint/shared'
import { data, redirect } from 'react-router'
import { loadSession } from './auth.server.js'

/**
 * The signed-in viewer if they hold `permission` (any of them, when a list is given). Visitors go
 * to log in; Members without the permission get a 403. Permission names only, never roles (PRD §4).
 */
export async function requireViewerPermission(
  request: Request,
  permission: string | readonly string[],
): Promise<Viewer> {
  const { viewer } = await loadSession(request)
  if (!viewer) throw redirect('/login')
  const wanted = typeof permission === 'string' ? [permission] : permission
  if (!wanted.some((name) => viewer.permissions.includes(name))) {
    throw data('Forbidden', { status: 403 })
  }
  return viewer
}
