import { APP_NAME, registerRequestSchema } from '@reprint/shared'
import { redirect } from 'react-router'
import { RegisterPage } from '../components/auth/register-page.js'
import { copy } from '../copy/index.js'
import { failed, forwardCookies, loadSession, postToApi } from '../lib/auth.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/register'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.auth.register.title}`, noindex: true })
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await loadSession(request)
  if (session.viewer) throw redirect('/')
  return { signupsOpen: session.signupsOpen }
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = registerRequestSchema.safeParse(await request.json())
  if (!parsed.success) return { formError: copy.auth.genericError }
  const result = await postToApi(request, '/v1/auth/register', parsed.data, copy.auth.genericError)
  if (!result.ok) return failed(result)
  // A new account also gets the session cookie; a taken email gets the same body without it (D-076).
  const headers = new Headers()
  forwardCookies(result.response, headers)
  return Response.json({ status: 'check_your_email' }, { headers })
}

export default function Register({ loaderData }: Route.ComponentProps) {
  return <RegisterPage signupsOpen={loaderData.signupsOpen} />
}
