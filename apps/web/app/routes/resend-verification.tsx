import { data } from 'react-router'
import { copy } from '../copy/index.js'
import { postToApi } from '../lib/auth.server.js'
import type { Route } from './+types/resend-verification'

/** Resource route for the unverified banner. The API uses the signed-in Member's address. */
export async function action({ request }: Route.ActionArgs) {
  const result = await postToApi(
    request,
    '/v1/auth/resend-verification',
    {},
    copy.auth.banner.failed,
  )
  if (!result.ok) return data({ sent: false }, { status: result.status })
  return { sent: true }
}
