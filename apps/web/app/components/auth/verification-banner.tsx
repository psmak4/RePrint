import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

/** Shown to signed-in Members whose email is not verified yet (PRD §7.1). */
export function VerificationBanner({ verified }: { verified: boolean }) {
  const fetcher = useFetcher<{ sent?: boolean }>()
  if (verified) return null
  const c = copy.auth.banner
  const busy = fetcher.state !== 'idle'
  const status = fetcher.data ? (fetcher.data.sent ? c.sent : c.failed) : null
  return (
    <section aria-label={c.label} className="border-b border-border bg-muted px-4 py-3 text-sm">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2">
        <p>{c.message}</p>
        <fetcher.Form method="post" action="/resend-verification">
          <button type="submit" disabled={busy} className="text-link underline">
            {busy ? c.sending : c.resend}
          </button>
        </fetcher.Form>
        <p role="status">{status}</p>
      </div>
    </section>
  )
}
