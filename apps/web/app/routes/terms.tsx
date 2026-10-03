import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/terms'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.legal.terms.title} | ${APP_NAME}`,
    description: copy.legal.terms.description,
  })
}

export default function Terms() {
  return <StaticPage content={copy.legal.terms} />
}
