import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/privacy'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.legal.privacy.title} | ${APP_NAME}`,
    description: copy.legal.privacy.description,
  })
}

export default function Privacy() {
  return <StaticPage content={copy.legal.privacy} />
}
