import {
  APP_NAME,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  sessionListResponseSchema,
  sessionParamsSchema,
} from '@reprint/shared'
import { data, redirect } from 'react-router'
import { z } from 'zod'
import { SecuritySettingsPage } from '../components/settings/security-settings-page.js'
import { copy } from '../copy/index.js'
import { apiClientFor } from '../lib/api.server.js'
import { failed, forwardCookies, sendToApi } from '../lib/auth.server.js'
import { loadMe } from '../lib/me.server.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/settings-security'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.settings.security.title}`, noindex: true })
}

export async function loader({ request }: Route.LoaderArgs) {
  const [me, response] = await Promise.all([
    loadMe(request),
    apiClientFor(request).get('/v1/me/sessions'),
  ])
  if (response.status === 401) throw redirect('/login')
  if (!response.ok) throw new Response('Could not load your sessions.', { status: 502 })
  return { me, sessions: sessionListResponseSchema.parse(await response.json()).items }
}

const intentSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('change-email'), ...changeEmailRequestSchema.shape }),
  z.object({ intent: z.literal('change-password'), ...changePasswordRequestSchema.shape }),
  z.object({ intent: z.literal('end-session'), ...sessionParamsSchema.shape }),
  z.object({ intent: z.literal('logout-all') }),
  z.object({ intent: z.literal('delete-account'), ...deleteAccountRequestSchema.shape }),
])

/** One action for every security form; each posts JSON with an `intent` (D-091). */
export async function action({ request }: Route.ActionArgs) {
  const c = copy.settings.security
  const parsed = intentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return data({ formError: copy.auth.genericError }, { status: 400 })
  const { intent, ...body } = parsed.data

  if (intent === 'change-email') {
    const result = await sendToApi(request, 'POST', '/v1/me/email', body, c.email.failed)
    if (!result.ok) return failed(result)
    return { pendingEmail: (body as { newEmail: string }).newEmail }
  }
  if (intent === 'change-password') {
    const result = await sendToApi(request, 'POST', '/v1/me/password', body, c.password.failed)
    return result.ok ? { changed: true } : failed(result)
  }
  if (intent === 'end-session') {
    const { id } = body as { id: string }
    const result = await sendToApi(
      request,
      'DELETE',
      `/v1/me/sessions/${id}`,
      null,
      c.sessions.failed,
    )
    if (!result.ok) return failed(result)
    // Ending the session this browser uses clears its cookie, so it acts like logging out.
    const headers = new Headers()
    forwardCookies(result.response, headers)
    return headers.has('set-cookie') ? redirect('/', { headers }) : { ended: id }
  }
  const isDelete = intent === 'delete-account'
  const result = isDelete
    ? await sendToApi(request, 'DELETE', '/v1/me', body, c.delete.failed)
    : await sendToApi(request, 'POST', '/v1/auth/logout-all', null, c.sessions.failed)
  if (!result.ok) return failed(result)
  const headers = new Headers()
  forwardCookies(result.response, headers)
  return redirect(isDelete ? '/' : '/login', { headers })
}

export default function SettingsSecurity({ loaderData }: Route.ComponentProps) {
  return <SecuritySettingsPage me={loaderData.me} sessions={loaderData.sessions} />
}
