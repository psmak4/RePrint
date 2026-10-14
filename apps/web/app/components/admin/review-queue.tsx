import type { ModQueueItem, ModQueueResponse } from '@reprint/shared'
import { Button, cn } from '@reprint/ui'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { adminCopy } from '../../copy/admin.js'
import type { ClaimState } from '../../routes/admin-reviews.js'
import { InitialsAvatar } from '../books/avatar.js'
import { Cover } from '../books/cover.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { AdminPage } from './admin-page.js'
import { AdminCard, Badge, EmptyState } from './admin-ui.js'
import { AdminIcon } from './icons.js'
import { DecisionPanel, isTypingTarget, VersionComparison } from './review-decision.js'

const text = adminCopy.reviews

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
    <span role="img" aria-label={text.ratingOf(rating)} className="text-star">
      {'★'.repeat(rating)}
      <span className="text-[#d6d3d1]">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

/** A review that has waited an hour or more gets an amber age badge. */
const LONG_WAIT_MINUTES = 60

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
  if (queue.items.length === 0) return <EmptyState>{text.empty}</EmptyState>
  return (
    // No label of its own: the list inside is already named "Pending reviews".
    <AdminCard className="gap-1 p-3 md:p-3">
      <ul aria-label={text.listLabel} className="flex flex-col gap-1">
        {queue.items.map((item) => {
          const minutes = (Date.parse(now) - Date.parse(item.submittedAt)) / 60_000
          return (
            <li key={item.id}>
              <Link
                to={queueHref(item.id, cursor)}
                aria-label={text.open(item.book.title)}
                aria-current={item.id === selectedId ? 'true' : undefined}
                className="grid grid-cols-[40px_minmax(0,1fr)] gap-3.5 rounded-xl p-3.5 hover:bg-surface-raised aria-[current=true]:bg-accent/5 aria-[current=true]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
              >
                <Cover
                  cover={null}
                  title={item.book.title}
                  slug={item.book.slug}
                  size="small"
                  className="w-10"
                />
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-serif text-[17px] leading-tight font-medium break-words">
                    {item.book.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    @{item.reviewer.username}
                    <Stars rating={item.rating} />
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={minutes >= LONG_WAIT_MINUTES ? 'amber' : 'gray'}>
                      {text.age(ageText(item.submittedAt, now))}
                    </Badge>
                    {item.version > 1 ? <Badge>{text.editedBadge}</Badge> : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {queue.meta.nextCursor ? (
        <div className="flex justify-center p-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/reviews?cursor=${encodeURIComponent(queue.meta.nextCursor)}`}>
              {text.next}
            </Link>
          </Button>
        </div>
      ) : null}
    </AdminCard>
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
    <p
      role="status"
      className={cn(
        'flex items-center gap-2.5 border-b px-5 py-3 text-sm font-medium md:px-6',
        claim.state === 'mine'
          ? 'border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af]'
          : 'border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]',
      )}
    >
      <AdminIcon name="clock" className="size-4" />
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
    <article
      aria-label={text.detailLabel}
      // `overflow-clip`, not `overflow-hidden`: a hidden overflow would become the sticky bar's
      // scroller, and the bar would never stay pinned.
      className="flex min-w-0 flex-col overflow-clip rounded-[18px] border border-border bg-surface"
    >
      {claim ? <ClaimNotice claim={claim} /> : null}
      <div className="flex flex-col gap-6 p-5 md:p-6">
        <header className="flex items-center gap-4">
          <Cover
            cover={null}
            title={item.book.title}
            slug={item.book.slug}
            size="small"
            className="w-14 shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {text.bookLabel}
            </p>
            <h2 className="font-serif text-[26px] leading-tight font-medium break-words">
              <Link to={`/books/${item.book.slug}`} className="hover:underline">
                {item.book.title}
              </Link>
            </h2>
            {item.version > 1 ? (
              <p className="text-sm text-muted-foreground">{text.editedNote(item.version)}</p>
            ) : null}
          </div>
        </header>
        <div className="flex items-center gap-3.5 rounded-xl bg-[#f7f5f0] px-4 py-3.5">
          <InitialsAvatar name={reviewer.displayName} colorKey={reviewer.username} size="md" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[15px] font-semibold break-words">
              <span className="sr-only">{text.reviewerLabel}: </span>
              {reviewer.displayName}{' '}
              <span className="font-normal text-muted-foreground">@{reviewer.username}</span>
            </p>
            <p className="sr-only">{text.historyHeading}</p>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="green">{text.approved(reviewer.approvedCount)}</Badge>
              <Badge tone="red">{text.rejected(reviewer.rejectedCount)}</Badge>
              <Badge>{text.reported(reviewer.reportedCount)}</Badge>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xl">
            <Stars rating={item.rating} />
          </span>
          <Badge>{item.hasSpoilers ? text.spoilerFlag : text.noSpoilerFlag}</Badge>
          {item.editionId ? <Badge>{text.editionNote}</Badge> : null}
        </div>
        <section aria-labelledby="review-text-heading" className="flex flex-col gap-3">
          <h3 id="review-text-heading" className="sr-only">
            {text.bodyHeading}
          </h3>
          <p className="font-serif text-[26px] leading-tight font-medium break-words">
            {item.headline ?? text.untitled}
          </p>
          <div className="font-serif text-lg leading-[1.65] text-[#1e293b]">
            <ReviewBody body={item.body} />
          </div>
        </section>
        <VersionComparison item={item} />
      </div>
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

/** Two panes from `lg`: the oldest-first queue and the selected review (DESIGN.md, D-201). */
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
  const prompt = requested ? text.notInQueue : queue.items.length > 0 ? text.selectPrompt : null
  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[{ label: adminCopy.title, to: '/admin' }, { label: text.title }]}
    >
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <QueueList queue={queue} selectedId={selected?.id ?? null} cursor={cursor} now={now} />
        <div className="min-w-0">
          {selected ? (
            <ReviewDetail item={selected} claim={claim} nextHref={nextHref} />
          ) : prompt ? (
            <p className="rounded-[18px] border border-dashed border-[#d9d4ca] p-6 text-muted-foreground">
              {prompt}
            </p>
          ) : null}
        </div>
      </div>
    </AdminPage>
  )
}
