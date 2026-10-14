import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/community-guidelines'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${legalCopy.guidelines.title} | ${APP_NAME}`,
    description: legalCopy.guidelines.description,
  })
}

export default function CommunityGuidelines() {
  return <StaticPage content={legalCopy.guidelines} />
}
