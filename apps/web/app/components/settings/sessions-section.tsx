import type { SessionInfo } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function SessionRow({ session }: { session: SessionInfo }) {
  const c = copy.settings.security.sessions
  const fetcher = useFetcher<{ formError?: string }>()
  const busy = fetcher.state !== 'idle'
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium">
          {session.device}
          {session.current ? (
            <span className="ml-2 rounded-full bg-[#ecfdf3] px-2.5 py-0.5 text-xs font-medium text-success">
              {c.thisDevice}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {c.lastSeen(`${dateFormat.format(new Date(session.lastSeenAt))} UTC`)}
          {session.ip ? ` · ${session.ip}` : ''}
        </p>
        {fetcher.data?.formError ? (
          <p role="alert" className="text-sm text-danger">
            {fetcher.data.formError}
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        aria-label={c.endLabel(session.device)}
        onClick={() =>
          fetcher.submit(
            { intent: 'end-session', id: session.id },
            { method: 'post', encType: 'application/json' },
          )
        }
      >
        {busy ? c.working : c.end}
      </Button>
    </li>
  )
}

/** The Member's signed-in devices, each endable, plus "Log out everywhere". */
export function SessionsSection({ sessions }: { sessions: SessionInfo[] }) {
  const c = copy.settings.security.sessions
  const logoutAll = useFetcher<{ formError?: string }>()
  const busy = logoutAll.state !== 'idle'
  return (
    <section
      aria-labelledby="sessions-heading"
      className="rounded-2xl border border-border bg-surface p-6 md:p-8"
    >
      <h2 id="sessions-heading" className="font-serif text-2xl leading-tight font-medium">
        {c.title}
      </h2>
      <p className="mt-2 text-[15px] text-muted-foreground">{c.lead}</p>
      {sessions.length === 0 ? (
        <p className="mt-4">{c.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}
      {logoutAll.data?.formError ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {logoutAll.data.formError}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            logoutAll.submit(
              { intent: 'logout-all' },
              { method: 'post', encType: 'application/json' },
            )
          }
        >
          {busy ? c.working : c.logoutAll}
        </Button>
        <p className="text-sm text-muted-foreground">{c.logoutAllHint}</p>
      </div>
    </section>
  )
}
