import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import type { Route } from './+types/about'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: pageTitle(legalCopy.about.title),
    description: legalCopy.about.description,
  })
}

export default function About() {
  return <StaticPage content={legalCopy.about} />
}
