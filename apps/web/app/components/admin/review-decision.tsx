import { type ModQueueItem, REVIEW_DECISION_REASON_MAX } from '@reprint/shared'
import { Button, Label, Textarea } from '@reprint/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { useFetcher, useNavigate } from 'react-router'
import { copy } from '../../copy/index.js'
import { ReviewBody } from '../reviews/reviews-list.js'

const text = copy.admin.reviews

/** What the `/admin/reviews` action returns: the decision, or a form error. */
type DecisionResult = { decided: 'approved' | 'rejected'; reviewId: string } | { formError: string }

/** True when a key press belongs to a form control or carries a modifier, so shortcuts stand down. */
export function isTypingTarget(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * Approve and Reject for the opened review. Reject asks for an optional reason, chosen from saved
 * phrases or typed. `A` and `R` work anywhere except in a text field (PRD §7.10). When another
 * Moderator holds the claim, the buttons are off. After a decision the page moves to `nextHref`.
 */
export function DecisionPanel({
  reviewId,
  enabled,
  nextHref,
}: {
  reviewId: string
  enabled: boolean
  nextHref: string | null
}) {
  const fetcher = useFetcher<DecisionResult>()
  const navigate = useNavigate()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const reasonId = useId()
  const phraseId = useId()
  const hintId = useId()
  const busy = fetcher.state !== 'idle'
  const submitting = fetcher.formData?.get('intent') ?? null
  const result = fetcher.data
  const decided = result && 'decided' in result ? result.decided : null
  const failure = result && 'formError' in result ? result.formError : null

  const decide = (intent: 'approve' | 'reject') => {
    fetcher.submit(
      { intent, reviewId, ...(intent === 'reject' && reason.trim() ? { reason } : {}) },
      { method: 'post', encType: 'application/json' },
    )
  }

  // A different review starts with a clean panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the review changes
  useEffect(() => {
    setRejecting(false)
    setReason('')
  }, [reviewId])

  useEffect(() => {
    if (rejecting) reasonRef.current?.focus()
  }, [rejecting])

  useEffect(() => {
    if (decided) navigate(nextHref ?? '/admin/reviews')
  }, [decided, navigate, nextHref])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event) || busy) return
      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        decide('approve')
      } else if (key === 'r') {
        event.preventDefault()
        setRejecting(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!enabled) {
    return (
      <section aria-label={text.actionsLabel} className="text-sm text-muted-foreground">
        <p>{text.readOnly}</p>
      </section>
    )
  }
  return (
    <section aria-label={text.actionsLabel} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => decide('approve')}>
          {busy && submitting === 'approve' ? text.approving : text.approve}
        </Button>
        {rejecting ? null : (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            {text.reject}
          </Button>
        )}
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={phraseId}>{text.phraseLabel}</Label>
            <select
              id={phraseId}
              value=""
              onChange={(event) => setReason(event.target.value)}
              className="h-11 rounded-[10px] border border-input-border bg-surface px-3 text-[15px]"
            >
              <option value="">{text.phrasePlaceholder}</option>
              {text.phrases.map((phrase) => (
                <option key={phrase} value={phrase}>
                  {phrase}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={reasonId}>{text.reasonLabel}</Label>
            <Textarea
              id={reasonId}
              ref={reasonRef}
              value={reason}
              maxLength={REVIEW_DECISION_REASON_MAX}
              aria-describedby={hintId}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
            <p id={hintId} className="text-sm text-muted-foreground">
              {text.reasonHint(REVIEW_DECISION_REASON_MAX)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={busy} onClick={() => decide('reject')}>
              {busy && submitting === 'reject' ? text.rejecting : text.rejectConfirm}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRejecting(false)
                setReason('')
              }}
            >
              {text.cancel}
            </Button>
          </div>
        </div>
      ) : null}
      {decided ? (
        <p role="status" className="text-sm">
          {text.decided(decided)}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{text.shortcuts}</p>
    </section>
  )
}

type Version = Pick<ModQueueItem, 'rating' | 'headline' | 'body' | 'hasSpoilers'>

function VersionColumn({
  heading,
  version,
  changed,
}: {
  heading: string
  version: Version
  changed: { rating: boolean; headline: boolean; body: boolean; hasSpoilers: boolean }
}) {
  const flag = (isChanged: boolean) => (isChanged ? text.changed : text.unchanged)
  return (
    <section
      aria-label={heading}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
    >
      <h4 className="font-semibold">{heading}</h4>
      <dl className="flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">
            {text.ratingLabel} ({flag(changed.rating)})
          </dt>
          <dd>{text.ratingOf(version.rating)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {text.headlineLabel} ({flag(changed.headline)})
          </dt>
          <dd>{version.headline ?? text.untitled}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {text.spoilersLabel} ({flag(changed.hasSpoilers)})
          </dt>
          <dd>{version.hasSpoilers ? text.spoilersYes : text.spoilersNo}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {text.bodyHeading} ({flag(changed.body)})
          </dt>
          <dd>
            <ReviewBody body={version.body} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

/** An edited review next to the last approved version, with each field marked changed or not. */
export function VersionComparison({ item }: { item: ModQueueItem }) {
  const before = item.lastApproved
  if (!before) return null
  const changed = {
    rating: before.rating !== item.rating,
    headline: before.headline !== item.headline,
    body: before.body !== item.body,
    hasSpoilers: before.hasSpoilers !== item.hasSpoilers,
  }
  return (
    <section aria-labelledby="compare-heading" className="flex flex-col gap-2">
      <h3 id="compare-heading" className="font-semibold">
        {text.compareHeading}
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        <VersionColumn heading={text.lastApprovedHeading} version={before} changed={changed} />
        <VersionColumn heading={text.submittedHeading} version={item} changed={changed} />
      </div>
    </section>
  )
}
