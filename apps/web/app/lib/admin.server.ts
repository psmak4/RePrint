import type { Viewer } from '@reprint/shared'
import { data, type RouterContextProvider, redirect } from 'react-router'
import { viewerSession } from './session.server.js'

/**
 * The signed-in viewer if they hold `permission` (any of them, when a list is given). Visitors go
 * to log in; Members without the permission get a 403. Permission names only, never roles (PRD §4).
 */
export async function requireViewerPermission(
  args: { request: Request; context?: Readonly<RouterContextProvider> },
  permission: string | readonly string[],
): Promise<Viewer> {
  const { viewer } = await viewerSession(args)
  if (!viewer) throw redirect('/login')
  const wanted = typeof permission === 'string' ? [permission] : permission
  if (!wanted.some((name) => viewer.permissions.includes(name))) {
    throw data('Forbidden', { status: 403 })
  }
  return viewer
}
