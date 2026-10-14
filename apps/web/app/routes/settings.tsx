import { redirect } from 'react-router'
import { SettingsLayout } from '../components/settings/settings-layout.js'
import { settingsCopy } from '../copy/settings.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import { viewerSession } from '../lib/session.server.js'
import type { Route } from './+types/settings'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, { title: pageTitle(settingsCopy.title), noindex: true })
}

/** Every settings page needs a signed-in Member. */
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!(await viewerSession({ request, context })).viewer) throw redirect('/login')
  return null
}

export default function Settings() {
  return <SettingsLayout />
}
