import type { ModQueueItem, ModQueueResponse } from '@reprint/shared'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { copy } from '../../copy/index.js'
import type { ClaimState } from '../../routes/admin-reviews.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { DecisionPanel, isTypingTarget, VersionComparison } from './review-decision.js'

const text = copy.admin.reviews

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

/** "5 minutes", "3 hours", "2 days": the largest whole unit since `from`. */
export function ageText(from: string, now: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(from)) / 60_000))
  if (minutes < 60) return text.ageMinutes(minutes)
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? text.ageHours(hours) : text.ageDays(Math.floor(hours / 24))
}

function queueHref(id: string, cursor: string | null): string {
  const params = new URLSearchParams({ review: id })
  if (cursor) params.set('cursor', cursor)
  return `/admin/reviews?${params}`
}

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={text.ratingOf(rating)} className="text-warning">
      {'★'.repeat(rating)}
      <span className="text-input-border">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

function QueueList({
  queue,
  selectedId,
  cursor,
  now,
}: {
  queue: ModQueueResponse
  selectedId: string | null
  cursor: string | null
  now: string
}) {
  if (queue.items.length === 0) return <p className="text-muted-foreground">{text.empty}</p>
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={text.listLabel} className="flex flex-col gap-2">
        {queue.items.map((item) => (
          <li key={item.id}>
            <Link
              to={queueHref(item.id, cursor)}
              aria-label={text.open(item.book.title)}
              aria-current={item.id === selectedId ? 'true' : undefined}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:border-primary aria-[current=true]:border-primary"
            >
              <span className="font-semibold">{item.book.title}</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stars rating={item.rating} />
                <span>{text.age(ageText(item.submittedAt, now))}</span>
              </span>
              <span className="text-sm text-muted-foreground">@{item.reviewer.username}</span>
            </Link>
          </li>
        ))}
      </ul>
      {queue.meta.nextCursor ? (
        <Link
          to={`/admin/reviews?cursor=${encodeURIComponent(queue.meta.nextCursor)}`}
          className="text-sm text-link underline"
        >
          {text.next}
        </Link>
      ) : null}
    </div>
  )
}

function ClaimNotice({ claim }: { claim: ClaimState }) {
  const message =
    claim.state === 'mine'
      ? text.claimedByYou(timeFormat.format(new Date(claim.expiresAt)))
      : claim.state === 'other'
        ? claim.name
          ? text.claimedByOther(claim.name)
          : text.claimFailed
        : text.claimFailed
  return (
    <p role="status" className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
      {message}
    </p>
  )
}

function ReviewDetail({
  item,
  claim,
  nextHref,
}: {
  item: ModQueueItem
  claim: ClaimState | null
  nextHref: string | null
}) {
  const { reviewer } = item
  return (
    <article aria-label={text.detailLabel} className="flex flex-col gap-4">
      {claim ? <ClaimNotice claim={claim} /> : null}
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">
          <Link to={`/books/${item.book.slug}`} className="text-link underline">
            {item.book.title}
          </Link>
        </h2>
        {item.version > 1 ? (
          <p className="text-sm text-muted-foreground">{text.editedNote(item.version)}</p>
        ) : null}
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{text.reviewerLabel}</dt>
        <dd>
          {reviewer.displayName} (@{reviewer.username})
        </dd>
        <dt className="text-muted-foreground">{text.historyHeading}</dt>
        <dd>
          {[
            text.approved(reviewer.approvedCount),
            text.rejected(reviewer.rejectedCount),
            text.reported(reviewer.reportedCount),
          ].join(' · ')}
        </dd>
        <dt className="text-muted-foreground">{text.ratingLabel}</dt>
        <dd>
          <Stars rating={item.rating} />
        </dd>
        <dd className="col-span-2">{item.hasSpoilers ? text.spoilerFlag : text.noSpoilerFlag}</dd>
        {item.editionId ? <dd className="col-span-2">{text.editionNote}</dd> : null}
      </dl>
      <section aria-labelledby="review-text-heading" className="flex flex-col gap-2">
        <h3 id="review-text-heading" className="font-semibold">
          {text.bodyHeading}
        </h3>
        <p className="font-medium">{item.headline ?? text.untitled}</p>
        <ReviewBody body={item.body} />
      </section>
      <VersionComparison item={item} />
      <DecisionPanel reviewId={item.id} enabled={claim?.state === 'mine'} nextHref={nextHref} />
    </article>
  )
}

/** `J` opens the next review in the queue and `K` the previous one, except while typing. */
function useQueueShortcuts(
  queue: ModQueueResponse,
  selectedId: string | null,
  cursor: string | null,
) {
  const navigate = useNavigate()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event)) return
      const key = event.key.toLowerCase()
      if (key !== 'j' && key !== 'k') return
      const index = queue.items.findIndex((item) => item.id === selectedId)
      const target =
        key === 'j' ? queue.items[index + 1] : index === -1 ? undefined : queue.items[index - 1]
      if (!target) return
      event.preventDefault()
      navigate(queueHref(target.id, cursor))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [queue, selectedId, cursor, navigate])
}

/** Two panes from `lg`: the oldest-first queue and the selected review (DESIGN.md). */
export function ReviewQueue({
  queue,
  selected,
  requested,
  claim,
  cursor,
  now,
}: {
  queue: ModQueueResponse
  selected: ModQueueItem | null
  requested: boolean
  claim: ClaimState | null
  cursor: string | null
  now: string
}) {
  useQueueShortcuts(queue, selected?.id ?? null, cursor)
  // After a decision the page moves on: to the next item, or else the one before it.
  const position = queue.items.findIndex((item) => item.id === selected?.id)
  const following = queue.items[position + 1] ?? (position > 0 ? queue.items[position - 1] : null)
  const nextHref = following ? queueHref(following.id, cursor) : null
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{text.title}</h2>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <QueueList queue={queue} selectedId={selected?.id ?? null} cursor={cursor} now={now} />
        <div className="min-w-0">
          {selected ? (
            <ReviewDetail item={selected} claim={claim} nextHref={nextHref} />
          ) : (
            <p className="text-muted-foreground">
              {requested ? text.notInQueue : text.selectPrompt}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
