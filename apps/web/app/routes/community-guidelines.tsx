import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta, pageTitle } from '../lib/seo.js'
import type { Route } from './+types/community-guidelines'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: pageTitle(legalCopy.guidelines.title),
    description: legalCopy.guidelines.description,
  })
}

export default function CommunityGuidelines() {
  return <StaticPage content={legalCopy.guidelines} />
}
