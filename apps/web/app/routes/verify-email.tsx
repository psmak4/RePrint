import { APP_NAME, verifyEmailRequestSchema } from '@reprint/shared'
import { VerifyEmailPage } from '../components/auth/verify-email-page.js'
import { copy } from '../copy/index.js'
import { loadSession, postToApi } from '../lib/auth.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/verify-email'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.auth.verify.successTitle}`, noindex: true })
}

/** The emailed link is a GET, so the loader spends the token (D-082). */
export async function loader({ request }: Route.LoaderArgs) {
  const token = new URL(request.url).searchParams.get('token')
  const parsed = verifyEmailRequestSchema.safeParse({ token })
  const signedIn = Boolean((await loadSession(request)).viewer)
  if (!parsed.success) return { verified: false, signedIn }
  const result = await postToApi(
    request,
    '/v1/auth/verify-email',
    parsed.data,
    copy.auth.genericError,
  )
  return { verified: result.ok, signedIn }
}

export default function VerifyEmail({ loaderData }: Route.ComponentProps) {
  return <VerifyEmailPage verified={loaderData.verified} signedIn={loaderData.signedIn} />
}
