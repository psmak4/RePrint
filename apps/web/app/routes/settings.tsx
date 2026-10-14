import { APP_NAME } from '@reprint/shared'
import { redirect } from 'react-router'
import { SettingsLayout } from '../components/settings/settings-layout.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import { viewerSession } from '../lib/session.server.js'
import type { Route } from './+types/settings'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: `${APP_NAME}: ${copy.settings.title}`, noindex: true })
}

/** Every settings page needs a signed-in Member. */
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!(await viewerSession({ request, context })).viewer) throw redirect('/login')
  return null
}

export default function Settings() {
  return <SettingsLayout />
}
