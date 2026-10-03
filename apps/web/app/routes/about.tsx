import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/about'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.legal.about.title} | ${APP_NAME}`,
    description: copy.legal.about.description,
  })
}

export default function About() {
  return <StaticPage content={copy.legal.about} />
}
