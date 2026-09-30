import { APP_NAME, confirmEmailChangeRequestSchema } from '@reprint/shared'
import { ConfirmEmailChangePage } from '../components/settings/confirm-email-change-page.js'
import { copy } from '../copy/index.js'
import { loadSession, postToApi } from '../lib/auth.server.js'
import type { Route } from './+types/confirm-email-change'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.settings.confirmEmail.successTitle}` },
    { name: 'robots', content: 'noindex' },
  ]
}

/** The emailed link is a GET, so the loader spends the token, as verify-email does (D-082). */
export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get('token')
  const parsed = confirmEmailChangeRequestSchema.safeParse({ token })
  const signedIn = Boolean((await loadSession(request)).viewer)
  if (!parsed.success) return { changed: false, signedIn }
  const result = await postToApi(
    request,
    '/v1/me/email/confirm',
    parsed.data,
    copy.auth.genericError,
  )
  return { changed: result.ok, signedIn }
}

export default function ConfirmEmailChange({ loaderData }: Route.ComponentProps) {
  return <ConfirmEmailChangePage changed={loaderData.changed} signedIn={loaderData.signedIn} />
}
