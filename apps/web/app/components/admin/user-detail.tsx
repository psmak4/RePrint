import { type AdminUserDetail, ASSIGNABLE_ROLES, REVIEW_STATUSES } from '@reprint/shared'
import { Button, Input, Label, Textarea } from '@reprint/ui'
import { useId, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.admin.users
const actions = text.actions
const REASON_MAX = 500

type ActionResult =
  | { done: 'grant' | 'revoke'; changed: boolean }
  | { done: 'suspended' | 'unsuspended' }
  | { done: 'sessions'; revoked: number }
  | { done: 'resent'; sent: boolean }
  | { formError?: string; fieldErrors?: Record<string, string> }

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
const fmt = (iso: string) => dateTime.format(new Date(iso))

function doneMessage(result: ActionResult): string | null {
  if (!('done' in result)) return null
  switch (result.done) {
    case 'grant':
    case 'revoke':
      return !result.changed
        ? actions.unchanged
        : result.done === 'grant'
          ? actions.granted
          : actions.revoked
    case 'suspended':
      return actions.suspendedDone
    case 'unsuspended':
      return actions.unsuspendedDone
    case 'sessions':
      return actions.revokedDone(result.revoked)
    case 'resent':
      return result.sent ? actions.resendDone : actions.resendNotSent
  }
}

function Actions({
  detail,
  canAssign,
  canSuspend,
}: {
  detail: AdminUserDetail
  canAssign: boolean
  canSuspend: boolean
}) {
  const fetcher = useFetcher<ActionResult>()
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const reasonId = useId()
  const reasonHintId = useId()
  const untilId = useId()
  const untilHintId = useId()
  const busy = fetcher.state !== 'idle'
  const { user } = detail
  const result = fetcher.data
  const message = result ? doneMessage(result) : null
  const failure = result && 'formError' in result ? result.formError : undefined
  const reasonError = result && 'fieldErrors' in result ? result.fieldErrors?.reason : undefined

  const send = (body: Record<string, string>) =>
    fetcher.submit(body, { method: 'post', encType: 'application/json' })
  const deleted = user.status === 'deleted'
  const showResend = user.status === 'unverified'

  return (
    <section aria-label={actions.heading} className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{actions.heading}</h3>
      {canAssign ? (
        <fieldset className="flex flex-wrap gap-3">
          <legend className="sr-only">{actions.rolesHeading}</legend>
          {ASSIGNABLE_ROLES.map((role) =>
            user.roles.includes(role) ? (
              <Button
                key={role}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => send({ intent: 'revoke', role })}
              >
                {actions.revoke(text.roles[role])}
              </Button>
            ) : (
              <Button
                key={role}
                type="button"
                variant="outline"
                disabled={busy || deleted}
                onClick={() => send({ intent: 'grant', role })}
              >
                {actions.grant(text.roles[role])}
              </Button>
            ),
          )}
        </fieldset>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canSuspend && user.status === 'suspended' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => send({ intent: 'unsuspend' })}
          >
            {actions.unsuspend}
          </Button>
        ) : null}
        {canSuspend && !deleted && user.status !== 'suspended' && !suspending ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setSuspending(true)}
          >
            {actions.suspend}
          </Button>
        ) : null}
        {canSuspend ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => send({ intent: 'revoke-sessions' })}
          >
            {actions.revokeSessions}
          </Button>
        ) : null}
        {showResend ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => send({ intent: 'resend-verification' })}
          >
            {actions.resend}
          </Button>
        ) : null}
      </div>
      {suspending ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (reason.trim() === '') return
            send({ intent: 'suspend', reason, ...(until ? { until } : {}) })
          }}
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor={reasonId}>{actions.reasonLabel}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_MAX}
              required
              rows={3}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonHintId}
              onChange={(event) => setReason(event.target.value)}
            />
            <p id={reasonHintId} className="text-sm text-muted-foreground">
              {actions.reasonHint(REASON_MAX)}
            </p>
            {reasonError ? (
              <p role="alert" className="text-sm text-danger">
                {reasonError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={untilId}>{actions.untilLabel}</Label>
            <Input
              id={untilId}
              type="date"
              value={until}
              aria-describedby={untilHintId}
              onChange={(event) => setUntil(event.target.value)}
            />
            <p id={untilHintId} className="text-sm text-muted-foreground">
              {actions.untilHint}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || reason.trim() === ''}>
              {busy ? actions.suspending : actions.suspendConfirm}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSuspending(false)
                setReason('')
                setUntil('')
              }}
            >
              {actions.cancel}
            </Button>
          </div>
        </form>
      ) : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : null}
    </section>
  )
}

/** `/admin/users/:id`: profile, roles, sessions, reviews by status, reports, audit history, and actions. */
export function UserDetail({
  detail,
  canAssign,
  canSuspend,
}: {
  detail: AdminUserDetail
  now: string
  canAssign: boolean
  canSuspend: boolean
}) {
  const { user, admin } = detail
  const d = text.detail
  return (
    <section aria-labelledby="user-heading" className="flex flex-col gap-6">
      <Link to="/admin/users" className="text-sm text-link underline">
        {text.back}
      </Link>
      <header className="flex flex-col gap-1">
        <h2 id="user-heading" className="text-2xl font-semibold">
          {user.displayName}
        </h2>
        <p className="text-muted-foreground">
          @{user.username} · {text.statuses[user.status]} ·{' '}
          {user.roles.map((role) => text.roles[role]).join(', ')}
        </p>
        {user.status === 'suspended' ? (
          <p className="text-sm text-warning">
            {user.suspendedUntil
              ? d.suspendedUntil(fmt(user.suspendedUntil))
              : d.suspendedIndefinitely}
            {user.suspendedReason ? ` · ${d.suspendedReason}: ${user.suspendedReason}` : ''}
          </p>
        ) : null}
        {user.deletedAt ? <p className="text-sm">{d.deletedAt(fmt(user.deletedAt))}</p> : null}
      </header>

      <Actions detail={detail} canAssign={canAssign} canSuspend={canSuspend} />

      <section aria-label={d.profile} className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{d.profile}</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{d.email}</dt>
          <dd className="break-all">
            {user.email ?? text.noEmail}
            {user.email ? (
              <>
                {' · '}
                {user.emailVerifiedAt ? d.verified(fmt(user.emailVerifiedAt)) : d.notVerified}
              </>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">{d.bio}</dt>
          <dd className="whitespace-pre-line break-words">{user.bio ?? d.noBio}</dd>
          <dt className="text-muted-foreground">{d.joined}</dt>
          <dd>{fmt(user.joinedAt)}</dd>
        </dl>
        {user.status !== 'deleted' ? (
          <Link to={`/u/${user.username}`} className="text-sm text-link underline">
            {d.profileLink}
          </Link>
        ) : null}
      </section>

      <section aria-label={d.reviewsHeading} className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{d.reviewsHeading}</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {REVIEW_STATUSES.map((status) => (
            <div key={status} className="contents">
              <dt className="text-muted-foreground">{d.reviewStatuses[status]}</dt>
              <dd>{detail.reviews[status] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label={d.reportsHeading} className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{d.reportsHeading}</h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{d.reportsFiled}</dt>
          <dd>{detail.reports.filed}</dd>
          <dt className="text-muted-foreground">{d.reportsReceived}</dt>
          <dd>{detail.reports.received}</dd>
        </dl>
      </section>

      {admin ? (
        <>
          <section aria-label={d.sessionsHeading} className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">{d.sessionsHeading}</h3>
            {admin.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{d.noSessions}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {admin.sessions.map((session) => (
                  <li key={session.id} className="rounded-md border border-border p-2">
                    <p className="font-medium">{session.device}</p>
                    <p className="text-muted-foreground">
                      {d.sessionMeta(session.ip, fmt(session.lastSeenAt))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label={d.auditHeading} className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">{d.auditHeading}</h3>
            {admin.audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">{d.noAudit}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {admin.audit.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-border p-2">
                    <p className="font-medium">{entry.action}</p>
                    <p className="text-muted-foreground">
                      {d.auditBy(entry.actor?.username ?? null)} ·{' '}
                      <time dateTime={entry.createdAt}>{fmt(entry.createdAt)}</time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{d.limitedNote}</p>
      )}
    </section>
  )
}
