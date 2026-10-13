import { type AdminUserDetail, ASSIGNABLE_ROLES, REVIEW_STATUSES } from '@reprint/shared'
import { Button, Input, Label, Textarea } from '@reprint/ui'
import { type ReactNode, useId, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { InitialsAvatar } from '../books/avatar.js'
import { AdminPage } from './admin-page.js'
import { AdminCard, Badge, StatTile, USER_STATUS_TONE } from './admin-ui.js'
import { RoleBadges } from './users-list.js'

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
const dateOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const fmtDate = (iso: string) => dateOnly.format(new Date(iso))

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

/** The page's actions: buttons for the band, and the suspend form and results for the page body. */
function useUserActions(
  detail: AdminUserDetail,
  canAssign: boolean,
  canSuspend: boolean,
): { buttons: ReactNode; panel: ReactNode } {
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

  const buttons = (
    <>
      {canAssign ? (
        <fieldset className="contents">
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
        <Button type="button" variant="danger" disabled={busy} onClick={() => setSuspending(true)}>
          {actions.suspend}
        </Button>
      ) : null}
    </>
  )

  const panel =
    suspending || message || failure ? (
      <>
        {suspending ? (
          <AdminCard title={actions.suspend}>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (reason.trim() === '') return
                send({ intent: 'suspend', reason, ...(until ? { until } : {}) })
              }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-wrap gap-2.5">
                <Button type="submit" variant="danger" disabled={busy || reason.trim() === ''}>
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
          </AdminCard>
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
      </>
    ) : null
  return { buttons, panel }
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
  const { buttons, panel } = useUserActions(detail, canAssign, canSuspend)
  return (
    <AdminPage
      crumbs={[
        { label: copy.admin.title, to: '/admin' },
        { label: text.title, to: '/admin/users' },
        { label: `@${user.username}` },
      ]}
      leading={<InitialsAvatar name={user.displayName} colorKey={user.username} size="lg" />}
      title={user.displayName}
      lead={
        <span className="flex flex-wrap items-center gap-2.5">
          {d.joinedLine(user.username, fmtDate(user.joinedAt))}
          <Badge tone={USER_STATUS_TONE[user.status]} dot>
            {text.statuses[user.status]}
          </Badge>
          <RoleBadges roles={user.roles} />
        </span>
      }
      actions={buttons}
    >
      {panel}
      {user.status === 'suspended' ? (
        <p className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm break-words text-[#9a3412]">
          {user.suspendedUntil
            ? d.suspendedUntil(fmt(user.suspendedUntil))
            : d.suspendedIndefinitely}
          {user.suspendedReason ? ` · ${d.suspendedReason}: ${user.suspendedReason}` : ''}
        </p>
      ) : null}
      {user.deletedAt ? (
        <p className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm">
          {d.deletedAt(fmt(user.deletedAt))}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <AdminCard
            title={d.profile}
            actions={
              user.status !== 'deleted' ? (
                <Link
                  to={`/u/${user.username}`}
                  className="text-[15px] font-semibold text-link hover:underline"
                >
                  {d.profileLink}
                </Link>
              ) : null
            }
          >
            <dl className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15px]">
              <dt className="text-muted-foreground">{d.email}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-2.5">
                {/* Its own element: bare text in a flex row will not break to fit. */}
                <span className="min-w-0 break-all">{user.email ?? text.noEmail}</span>
                {user.email ? (
                  user.emailVerifiedAt ? (
                    <Badge tone="green">{d.verified(fmt(user.emailVerifiedAt))}</Badge>
                  ) : (
                    <Badge tone="amber">{d.notVerified}</Badge>
                  )
                ) : null}
              </dd>
              <dt className="text-muted-foreground">{d.bio}</dt>
              <dd className="whitespace-pre-line break-words">{user.bio ?? d.noBio}</dd>
              <dt className="text-muted-foreground">{d.joined}</dt>
              <dd>{fmt(user.joinedAt)}</dd>
            </dl>
          </AdminCard>
          <AdminCard title={d.reviewsHeading}>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REVIEW_STATUSES.map((status) => (
                <StatTile
                  key={status}
                  label={d.reviewStatuses[status]}
                  value={detail.reviews[status] ?? 0}
                />
              ))}
            </dl>
          </AdminCard>
          {admin ? (
            <AdminCard title={d.auditHeading}>
              {admin.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">{d.noAudit}</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {admin.audit.map((entry) => (
                    <li key={entry.id} className="grid grid-cols-[12px_minmax(0,1fr)] gap-3.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2.5 rounded-full border-2 border-accent bg-surface"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[15px] font-medium break-words">{entry.action}</span>
                        <span className="text-[13px] text-muted-foreground">
                          {d.auditBy(entry.actor?.username ?? null)} ·{' '}
                          <time dateTime={entry.createdAt}>{fmt(entry.createdAt)}</time>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </AdminCard>
          ) : (
            <p className="text-sm text-muted-foreground">{d.limitedNote}</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <AdminCard title={d.reportsHeading}>
            <dl className="grid grid-cols-2 gap-3">
              <StatTile label={d.reportsFiled} value={detail.reports.filed} />
              <StatTile label={d.reportsReceived} value={detail.reports.received} />
            </dl>
          </AdminCard>
          {admin ? (
            <AdminCard title={d.sessionsHeading}>
              {admin.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{d.noSessions}</p>
              ) : (
                <ul className="flex flex-col">
                  {admin.sessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex flex-col gap-0.5 border-t border-[#ece8e0] py-3 first:border-t-0 first:pt-0"
                    >
                      <span className="text-[15px] font-semibold break-words">
                        {session.device}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {d.sessionMeta(session.ip, fmt(session.lastSeenAt))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          ) : null}
        </div>
      </div>
    </AdminPage>
  )
}
