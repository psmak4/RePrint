import { Button } from '@reprint/ui'
import { isRouteErrorResponse } from 'react-router'
import { copy } from '../copy/index.js'

export function ErrorPage({ error }: { error: unknown }) {
  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">
        {notFound ? copy.error.notFoundTitle : copy.error.title}
      </h1>
      <p className="mt-4 text-slate-300">{notFound ? copy.error.notFoundBody : copy.error.body}</p>
      <Button asChild className="mt-8">
        <a href="/">{copy.error.home}</a>
      </Button>
    </main>
  )
}
