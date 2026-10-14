import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/privacy'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${legalCopy.privacy.title} | ${APP_NAME}`,
    description: legalCopy.privacy.description,
  })
}

export default function Privacy() {
  return <StaticPage content={legalCopy.privacy} />
}
