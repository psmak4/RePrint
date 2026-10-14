import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import type { Route } from './+types/terms'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: pageTitle(legalCopy.terms.title),
    description: legalCopy.terms.description,
  })
}

export default function Terms() {
  return <StaticPage content={legalCopy.terms} />
}
