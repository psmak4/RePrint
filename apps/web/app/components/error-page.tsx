import { isRouteErrorResponse } from 'react-router'
import { copy } from '../copy/index.js'
import { AuthCard, AuthNextLink } from './auth/auth-card.js'

export function ErrorPage({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const forbidden = isRouteErrorResponse(error) && error.status === 403
  return (
    <AuthCard
      title={
        notFound
          ? copy.error.notFoundTitle
          : forbidden
            ? copy.error.forbiddenTitle
            : copy.error.title
      }
      lead={
        notFound ? copy.error.notFoundBody : forbidden ? copy.error.forbiddenBody : copy.error.body
      }
    >
      <AuthNextLink href="/">{copy.error.home}</AuthNextLink>
    </AuthCard>
  )
}
