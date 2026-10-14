import { forgotPasswordRequestSchema } from '@reprint/shared'
import { redirect } from 'react-router'
import { ForgotPasswordPage } from '../components/auth/forgot-password-page.js'
import { copy } from '../copy/index.js'
import { failed, postToApi } from '../lib/auth.server.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import { viewerSession } from '../lib/session.server.js'
import type { Route } from './+types/forgot-password'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: pageTitle(copy.auth.forgot.title), noindex: true })
}

export async function loader({ request, context }: Route.LoaderArgs) {
  if ((await viewerSession({ request, context })).viewer) throw redirect('/')
  return null
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = forgotPasswordRequestSchema.safeParse(await request.json())
  if (!parsed.success) return { formError: copy.auth.genericError }
  const result = await postToApi(
    request,
    '/v1/auth/forgot-password',
    parsed.data,
    copy.auth.genericError,
  )
  if (!result.ok) return failed(result)
  return { status: 'check_your_email' }
}

export default function ForgotPassword() {
  return <ForgotPasswordPage />
}
