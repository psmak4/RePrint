import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/about'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${legalCopy.about.title} | ${APP_NAME}`,
    description: legalCopy.about.description,
  })
}

export default function About() {
  return <StaticPage content={legalCopy.about} />
}
