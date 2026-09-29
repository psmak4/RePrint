import { redirect } from 'react-router'
import { apiClientFor } from '../lib/api.server.js'
import { forwardCookies } from '../lib/auth.server.js'
import type { Route } from './+types/logout'

export function loader() {
  return redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const headers = new Headers()
  try {
    const response = await apiClientFor(request).request('/v1/auth/logout', { method: 'POST' })
    forwardCookies(response, headers)
  } catch {
    // The API is down: leave the cookie alone; the Member is still signed in and can retry.
  }
  return redirect('/', { headers })
}
