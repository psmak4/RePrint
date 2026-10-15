import { isRouteErrorResponse } from 'react-router'
import { copy } from '../copy/index.js'
import { pageTitle } from '../lib/seo.js'
import { AuthCard, AuthNextLink } from './auth/auth-card.js'

export function ErrorPage({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const forbidden = isRouteErrorResponse(error) && error.status === 403
  const title = notFound
    ? copy.error.notFoundTitle
    : forbidden
      ? copy.error.forbiddenTitle
      : copy.error.title
  return (
    <>
      {/* An error page has no route meta, so it names the tab itself (D-214). */}
      <title>{pageTitle(title)}</title>
      <AuthCard
        title={title}
        lead={
          notFound
            ? copy.error.notFoundBody
            : forbidden
              ? copy.error.forbiddenBody
              : copy.error.body
        }
      >
        <AuthNextLink href="/">{copy.error.home}</AuthNextLink>
      </AuthCard>
    </>
  )
}
