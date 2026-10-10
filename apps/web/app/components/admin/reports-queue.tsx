import {
  type ModReportItem,
  type ModReportsResponse,
  REVIEW_DECISION_REASON_MAX,
} from '@reprint/shared'
import { Button, Input, Label, Textarea } from '@reprint/ui'
import { useId, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { ageText } from './review-queue.js'

const text = copy.admin.reports

type ActionResult =
  | { done: 'dismissed' | 'unpublished' | 'suspended'; reviewId: string }
  | { formError?: string; fieldErrors?: Record<string, string> }

type Panel = 'unpublish' | 'suspend' | null

function ReasonField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | undefined
}) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={REVIEW_DECISION_REASON_MAX}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
      />
      <p id={hintId} className="text-sm text-muted-foreground">
        {text.reasonHint(REVIEW_DECISION_REASON_MAX)}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Dismiss, Unpublish (with a reason), and, for Admins, Suspend author, for one reported review. */
function ReportActions({
  item,
  canUnpublish,
  canSuspend,
}: {
  item: ModReportItem
  canUnpublish: boolean
  canSuspend: boolean
}) {
  const fetcher = useFetcher<ActionResult>()
  const [panel, setPanel] = useState<Panel>(null)
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const untilId = useId()
  const untilHintId = useId()
  const busy = fetcher.state !== 'idle'
  const submitting = fetcher.formData?.get('intent') ?? null
  const result = fetcher.data
  const done = result && 'done' in result ? result.done : null
  const failure = result && 'formError' in result ? result.formError : undefined
  const reasonError = result && 'fieldErrors' in result ? result.fieldErrors?.reason : undefined

  const send = (body: Record<string, string>) =>
    fetcher.submit(body, { method: 'post', encType: 'application/json' })
  const reviewId = item.review.id
  const closePanel = () => {
    setPanel(null)
    setReason('')
    setUntil('')
  }

  return (
    <section aria-label={text.actionsLabel} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => send({ intent: 'dismiss', reviewId })}>
          {busy && submitting === 'dismiss' ? text.dismissing : text.dismiss}
        </Button>
        {canUnpublish && panel !== 'unpublish' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setPanel('unpublish')}
          >
            {text.unpublish}
          </Button>
        ) : null}
        {canSuspend && panel !== 'suspend' ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setPanel('suspend')}
          >
            {text.suspendAuthor}
          </Button>
        ) : null}
      </div>
      {panel ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (reason.trim() === '') return
            if (panel === 'unpublish') send({ intent: 'unpublish', reviewId, reason })
            else {
              send({
                intent: 'suspend',
                reviewId,
                userId: item.review.author.id,
                reason,
                ...(until ? { until } : {}),
              })
            }
          }}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <ReasonField
            label={panel === 'unpublish' ? text.reasonLabel : text.suspendReasonLabel}
            value={reason}
            onChange={setReason}
            error={reasonError}
          />
          {panel === 'suspend' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={untilId}>{text.suspendUntilLabel}</Label>
              <Input
                id={untilId}
                type="date"
                value={until}
                aria-describedby={untilHintId}
                onChange={(event) => setUntil(event.target.value)}
              />
              <p id={untilHintId} className="text-sm text-muted-foreground">
                {text.suspendUntilHint}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || reason.trim() === ''}>
              {panel === 'unpublish'
                ? busy && submitting === 'unpublish'
                  ? text.unpublishing
                  : text.unpublishConfirm
                : busy && submitting === 'suspend'
                  ? text.suspending
                  : text.suspendConfirm}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={closePanel}>
              {text.cancel}
            </Button>
          </div>
        </form>
      ) : null}
      {done ? (
        <p role="status" className="text-sm">
          {done === 'dismissed'
            ? text.dismissed
            : done === 'unpublished'
              ? text.unpublished
              : text.suspended}
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

const dateFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function ReportedReview({
  item,
  now,
  canUnpublish,
  canSuspend,
}: {
  item: ModReportItem
  now: string
  canUnpublish: boolean
  canSuspend: boolean
}) {
  const { review } = item
  const headingId = useId()
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <header className="flex flex-col gap-1">
          <h3 id={headingId} className="font-semibold">
            <Link to={`/books/${review.book.slug}`} className="underline">
              {review.book.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            <Link to={`/u/${review.author.username}`} className="underline">
              {text.reviewBy(review.author.displayName)}
            </Link>{' '}
            · {text.reportCount(item.openCount)} ·{' '}
            {text.oldest(ageText(item.oldestReportedAt, now))}
          </p>
          {review.hidden ? <p className="text-sm text-warning">{text.hidden}</p> : null}
        </header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span role="img" aria-label={text.ratingOf(review.rating)} className="text-warning">
            {'★'.repeat(review.rating)}
            <span className="text-input-border">{'★'.repeat(5 - review.rating)}</span>
          </span>
          <span className="font-medium">{review.headline ?? text.untitled}</span>
          {review.hasSpoilers ? (
            <span className="text-sm text-muted-foreground">{text.spoilerFlag}</span>
          ) : null}
        </div>
        <ReviewBody body={review.body} />
        <section aria-label={text.reportsHeading} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{text.reportsHeading}</h4>
          <ul className="flex flex-col gap-2 text-sm">
            {item.reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-border bg-surface p-3">
                <p className="font-medium">{text.reasons[report.reason]}</p>
                {report.note ? (
                  <p className="whitespace-pre-line break-words">{report.note}</p>
                ) : null}
                <p className="text-muted-foreground">
                  {text.reportedBy(report.reporter.displayName)} ·{' '}
                  <time dateTime={report.createdAt}>
                    {dateFormat.format(new Date(report.createdAt))}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        </section>
        <ReportActions item={item} canUnpublish={canUnpublish} canSuspend={canSuspend} />
      </article>
    </li>
  )
}

/** `/admin/reports`: reviews with open reports, oldest first, with the reasons given (PRD §7.10). */
export function ReportsQueue({
  queue,
  now,
  canUnpublish,
  canSuspend,
}: {
  queue: ModReportsResponse
  cursor: string | null
  now: string
  canUnpublish: boolean
  canSuspend: boolean
}) {
  return (
    <section aria-labelledby="reports-heading" className="flex flex-col gap-4">
      <h2
        id="reports-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      {queue.items.length === 0 ? (
        <p className="text-muted-foreground">{text.empty}</p>
      ) : (
        <ul aria-label={text.listLabel} className="flex flex-col gap-4">
          {queue.items.map((item) => (
            <ReportedReview
              key={item.review.id}
              item={item}
              now={now}
              canUnpublish={canUnpublish}
              canSuspend={canSuspend}
            />
          ))}
        </ul>
      )}
      {queue.meta.nextCursor ? (
        <Link
          to={`/admin/reports?${new URLSearchParams({ cursor: queue.meta.nextCursor })}`}
          className="underline"
        >
          {text.next}
        </Link>
      ) : null}
    </section>
  )
}
