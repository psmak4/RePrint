import { redirect } from 'react-router'
import { apiClientFor } from '../lib/api.server.js'
import type { Route } from './+types/settings-export'

/** Resource route: streams the API's data download to the browser with its download headers. */
export async function loader({ request }: Route.LoaderArgs) {
  const response = await apiClientFor(request).get('/v1/me/export')
  if (response.status === 401) throw redirect('/login')
  if (!response.ok) throw new Response('Could not prepare your data download.', { status: 502 })
  const headers = new Headers()
  for (const name of ['content-type', 'content-disposition', 'cache-control']) {
    const value = response.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(response.body, { status: 200, headers })
}
