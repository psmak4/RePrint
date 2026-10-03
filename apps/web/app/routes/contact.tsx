import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { copy } from '../copy/index.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/contact'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${copy.legal.contact.title} | ${APP_NAME}`,
    description: copy.legal.contact.description,
  })
}

export default function Contact() {
  return (
    <StaticPage content={copy.legal.contact}>
      <p className="mt-6">
        <strong>{copy.legal.contact.emailLabel}:</strong> {copy.legal.contactPlaceholder}
      </p>
    </StaticPage>
  )
}
