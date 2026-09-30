import { APP_NAME } from '@reprint/shared'
import { redirect } from 'react-router'
import { SettingsLayout } from '../components/settings/settings-layout.js'
import { copy } from '../copy/index.js'
import { loadSession } from '../lib/auth.server.js'
import type { Route } from './+types/settings'

export function meta() {
  return [{ title: `${APP_NAME}: ${copy.settings.title}` }, { name: 'robots', content: 'noindex' }]
}

/** Every settings page needs a signed-in Member. */
export async function loader({ request }: Route.LoaderArgs) {
  if (!(await loadSession(request)).viewer) throw redirect('/login')
  return null
}

export default function Settings() {
  return <SettingsLayout />
}
