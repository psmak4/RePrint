import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import type { Route } from './+types/privacy'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: pageTitle(legalCopy.privacy.title),
    description: legalCopy.privacy.description,
  })
}

export default function Privacy() {
  return <StaticPage content={legalCopy.privacy} />
}
