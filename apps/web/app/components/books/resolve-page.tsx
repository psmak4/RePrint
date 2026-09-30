import { Button } from '@reprint/ui'
import { Form, Link, useNavigation } from 'react-router'
import { copy } from '../../copy/index.js'

export type ResolvePageProps = {
  state: 'failed' | 'notFound'
  /** The candidate reference to try again; null when there is nothing to retry. */
  candidateRef: string | null
}

/** Shown when a search result couldn't be stored: retry when the Source was slow, search again when it expired. */
export function ResolvePage({ state, candidateRef }: ResolvePageProps) {
  const navigation = useNavigation()
  const retrying = navigation.state === 'loading'
  const c = copy.resolve

  if (state === 'notFound' || candidateRef === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">{c.notFoundHeading}</h1>
        <p className="mt-3 text-muted-foreground">{c.notFoundBody}</p>
        <Button asChild className="mt-6">
          <Link to="/search">{c.backToSearch}</Link>
        </Button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{c.failedHeading}</h1>
      <p className="mt-3 text-muted-foreground">{c.failedBody}</p>
      {/* A GET form to the same URL runs the loader again, so retry works without JavaScript. */}
      <Form method="get" action="/resolve" className="mt-6">
        <input type="hidden" name="ref" value={candidateRef} />
        <Button type="submit" disabled={retrying}>
          {retrying ? c.loading : c.retry}
        </Button>
      </Form>
      <p role="status" className="sr-only">
        {retrying ? c.loading : ''}
      </p>
    </main>
  )
}
