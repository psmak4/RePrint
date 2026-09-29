import { APP_NAME, loginRequestSchema } from '@reprint/shared'
import { redirect } from 'react-router'
import { LoginPage } from '../components/auth/login-page.js'
import { copy } from '../copy/index.js'
import { failed, forwardCookies, loadSession, postToApi } from '../lib/auth.server.js'
import type { Route } from './+types/login'

export function meta() {
  return [{ title: `${APP_NAME}: ${copy.auth.login.title}` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  if ((await loadSession(request)).viewer) throw redirect('/')
  return null
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = loginRequestSchema.safeParse(await request.json())
  if (!parsed.success) return { formError: copy.auth.genericError }
  const result = await postToApi(request, '/v1/auth/login', parsed.data, copy.auth.genericError)
  if (!result.ok) return failed(result)
  const headers = new Headers()
  forwardCookies(result.response, headers)
  return redirect('/', { headers })
}

export default function Login() {
  return <LoginPage />
}
