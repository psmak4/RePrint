import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/community-guidelines'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.legal.guidelines.title} | ${APP_NAME}`,
    description: copy.legal.guidelines.description,
  })
}

export default function CommunityGuidelines() {
  return <StaticPage content={copy.legal.guidelines} />
}
