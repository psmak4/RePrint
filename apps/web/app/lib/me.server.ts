import { type Me, meSchema } from '@reprint/shared'
import { redirect } from 'react-router'
import { apiClientFor } from './api.server.js'

/** The signed-in Member's own account. Visitors are sent to log in; API failures reach the error page. */
export async function loadMe(request: Request): Promise<Me> {
  const response = await apiClientFor(request).get('/v1/me')
  if (response.status === 401) throw redirect('/login')
  if (!response.ok) throw new Response('Could not load the account.', { status: 502 })
  return meSchema.parse(await response.json())
}
