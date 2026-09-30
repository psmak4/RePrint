import { APP_NAME, updateMeRequestSchema } from '@reprint/shared'
import { data } from 'react-router'
import { ProfileSettingsPage } from '../components/settings/profile-settings-page.js'
import { copy } from '../copy/index.js'
import { failed, sendToApi } from '../lib/auth.server.js'
import { loadMe } from '../lib/me.server.js'
import type { Route } from './+types/settings-profile'

export function meta() {
  return [
    { title: `${APP_NAME}: ${copy.settings.profile.title}` },
    { name: 'robots', content: 'noindex' },
  ]
}

export async function loader({ request }: Route.LoaderArgs) {
  return { me: await loadMe(request) }
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = updateMeRequestSchema.safeParse(await request.json())
  if (!parsed.success) return data({ formError: copy.settings.profile.failed }, { status: 400 })
  const result = await sendToApi(
    request,
    'PATCH',
    '/v1/me',
    parsed.data,
    copy.settings.profile.failed,
  )
  if (!result.ok) return failed(result)
  return { saved: true }
}

export default function SettingsProfile({ loaderData }: Route.ComponentProps) {
  return <ProfileSettingsPage me={loaderData.me} />
}
