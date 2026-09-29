import { APP_NAME, resetPasswordRequestSchema } from '@reprint/shared'
import { data } from 'react-router'
import { ResetPasswordPage } from '../components/auth/reset-password-page.js'
import { copy } from '../copy/index.js'
import { failed, postToApi } from '../lib/auth.server.js'
import type { Route } from './+types/reset-password'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.auth.reset.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

export function loader({ request }: Route.LoaderArgs) {
  return { token: new URL(request.url).searchParams.get('token') ?? '' }
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = resetPasswordRequestSchema.safeParse(await request.json())
  if (!parsed.success) return { formError: copy.auth.genericError }
  const result = await postToApi(
    request,
    '/v1/auth/reset-password',
    parsed.data,
    copy.auth.genericError,
  )
  if (!result.ok) {
    // The token is not a visible field, so its error becomes a form-level message.
    if (result.failure.fieldErrors?.token) {
      return data({ formError: copy.auth.reset.invalidBody }, { status: result.status })
    }
    return failed(result)
  }
  return { status: 'password_reset' }
}

export default function ResetPassword({ loaderData }: Route.ComponentProps) {
  return <ResetPasswordPage token={loaderData.token} />
}
