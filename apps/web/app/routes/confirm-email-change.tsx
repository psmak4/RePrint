import { confirmEmailChangeRequestSchema } from '@reprint/shared'
import { ConfirmEmailChangePage } from '../components/settings/confirm-email-change-page.js'
import { copy } from '../copy/index.js'
import { settingsCopy } from '../copy/settings.js'
import { postToApi } from '../lib/auth.server.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import { viewerSession } from '../lib/session.server.js'
import type { Route } from './+types/confirm-email-change'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: pageTitle(settingsCopy.confirmEmail.successTitle),
    noindex: true,
  })
}

/** The emailed link is a GET, so the loader spends the token, as verify-email does (D-082). */
export async function loader({ request, context }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get('token')
  const parsed = confirmEmailChangeRequestSchema.safeParse({ token })
  const signedIn = Boolean((await viewerSession({ request, context })).viewer)
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
