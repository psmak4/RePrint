import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { postToApi } from '../lib/auth.server.js'
import type { Route } from './+types/notifications-read'

/** Resource route for the header bell: opening it marks the Member's notifications read. */
export async function action({ request }: Route.ActionArgs) {
  const result = await postToApi(
    request,
    '/v1/me/notifications/read',
    { all: true },
    copy.shell.notifications.readFailed,
  )
  if (!result.ok) return data({ read: false }, { status: result.status })
  return { read: true }
}
