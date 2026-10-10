import { Button } from '@reprint/ui'
import { Form, Link, useNavigation } from 'react-router'
import { copy } from '../../copy/index.js'
import { AuthCard } from '../auth/auth-card.js'

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
      <AuthCard title={c.notFoundHeading} lead={c.notFoundBody}>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/search">{c.backToSearch}</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={c.failedHeading} lead={c.failedBody}>
      {/* A GET form to the same URL runs the loader again, so retry works without JavaScript. */}
      <Form method="get" action="/resolve" className="mt-6">
        <input type="hidden" name="ref" value={candidateRef} />
        <Button type="submit" size="lg" className="w-full" disabled={retrying}>
          {retrying ? c.loading : c.retry}
        </Button>
      </Form>
      <p role="status" className="sr-only">
        {retrying ? c.loading : ''}
      </p>
    </AuthCard>
  )
}
