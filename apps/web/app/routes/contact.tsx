import { APP_NAME } from '@reprint/shared'
import { StaticPage } from '../components/legal/static-page.js'
import { legalCopy } from '../copy/legal.js'
import { pageMeta } from '../lib/seo.js'
import type { Route } from './+types/contact'

export function meta(args: Route.MetaArgs) {
  return pageMeta(args, {
    title: `${legalCopy.contact.title} | ${APP_NAME}`,
    description: legalCopy.contact.description,
  })
}

export default function Contact() {
  return (
    <StaticPage content={legalCopy.contact}>
      <p className="mt-6">
        <strong>{legalCopy.contact.emailLabel}:</strong>{' '}
        <a className="underline" href={`mailto:${legalCopy.contactEmail}`}>
          {legalCopy.contactEmail}
        </a>
      </p>
    </StaticPage>
  )
}
