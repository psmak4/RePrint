import { Button } from '@reprint/ui'
import { isRouteErrorResponse } from 'react-router'
import { copy } from '../copy/index.js'

export function ErrorPage({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const forbidden = isRouteErrorResponse(error) && error.status === 403
  return (
    <section className="mx-auto max-w-2xl py-16">
      <h1 className="text-3xl font-semibold">
        {notFound
          ? copy.error.notFoundTitle
          : forbidden
            ? copy.error.forbiddenTitle
            : copy.error.title}
      </h1>
      <p className="mt-4 text-muted-foreground">
        {notFound
          ? copy.error.notFoundBody
          : forbidden
            ? copy.error.forbiddenBody
            : copy.error.body}
      </p>
      <Button asChild className="mt-8">
        <a href="/">{copy.error.home}</a>
      </Button>
    </section>
  )
}
