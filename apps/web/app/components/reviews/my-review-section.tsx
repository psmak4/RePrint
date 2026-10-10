import type { Edition, MyReview, Viewer } from '@reprint/shared'
import { Button } from '@reprint/ui'
import { useCallback, useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { type ReviewActionResult, ReviewForm } from './review-form.js'
import { SpoilerToggle } from './spoiler-toggle.js'

const c = copy.reviews.mine

/** The viewer's own controls on the Book page: write a review, or see, edit, and delete theirs (PRD §7.4, §7.6). */
export function MyReviewSection({
  viewer,
  myReview,
  editions,
}: {
  viewer: Viewer | null
  myReview: MyReview | null
  editions: Edition[]
}) {
  if (!viewer) {
    return (
      <Shell heading={c.writeHeading}>
        <p>
          <Link to="/login" className="text-link underline">
            {c.logIn}
          </Link>{' '}
          {c.logInPrompt}
        </p>
      </Shell>
    )
  }
  // Unverified Members cannot write, but may still see and remove a review they already have.
  if (!viewer.verified && !myReview) {
    return (
      <Shell heading={c.writeHeading}>
        <p>{c.verifyPrompt}</p>
      </Shell>
    )
  }
  return <Viewing viewer={viewer} myReview={myReview} editions={editions} />
}

function Shell({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="my-review-heading"
      className="flex h-full flex-col gap-3 rounded-[14px] border border-border bg-background p-5"
    >
      <h2
        id="my-review-heading"
        className="text-xs font-semibold tracking-[0.12em] text-link uppercase"
      >
        {heading}
      </h2>
      <div className="flex flex-col gap-3 text-[15px] leading-normal">{children}</div>
    </section>
  )
}

function Viewing({
  viewer,
  myReview,
  editions,
}: {
  viewer: Viewer
  myReview: MyReview | null
  editions: Edition[]
}) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const stopEditing = useCallback(() => {
    setEditing(false)
    setNotice(c.saved)
  }, [])

  if (!myReview) {
    return (
      <Shell heading={c.writeHeading}>
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
        {editing ? (
          <ReviewForm
            existing={null}
            editions={editions}
            onSaved={stopEditing}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Button type="button" onClick={() => setEditing(true)}>
            {c.write}
          </Button>
        )}
      </Shell>
    )
  }

  if (editing && viewer.verified) {
    return (
      <Shell heading={c.editHeading}>
        <p className="text-sm text-muted-foreground">{c.editWarning}</p>
        <ReviewForm
          existing={myReview}
          editions={editions}
          onSaved={stopEditing}
          onCancel={() => setEditing(false)}
        />
      </Shell>
    )
  }
  return (
    <OwnReview
      review={myReview}
      canEdit={viewer.verified}
      notice={notice}
      onEdit={() => {
        setNotice(null)
        setEditing(true)
      }}
    />
  )
}

function OwnReview({
  review,
  canEdit,
  notice,
  onEdit,
}: {
  review: MyReview
  canEdit: boolean
  notice: string | null
  onEdit: () => void
}) {
  const fetcher = useFetcher<ReviewActionResult>()
  const [confirming, setConfirming] = useState(false)
  const busy = fetcher.state !== 'idle'
  const failed = fetcher.data?.formError
  // A failed delete leaves the confirmation open so the Member can try again.
  useEffect(() => {
    if (fetcher.data?.deleted) setConfirming(false)
  }, [fetcher.data])

  const body = (
    <div>
      {review.headline ? <p className="font-semibold">{review.headline}</p> : null}
      <p className="mt-1 whitespace-pre-line break-words">{review.body}</p>
    </div>
  )
  return (
    <Shell heading={c.heading}>
      {notice ? (
        <p role="status" className="mb-2 text-sm">
          {notice}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-2">
        <span role="img" aria-label={copy.reviews.starRating.starLabel(review.rating)}>
          <span aria-hidden="true" className="text-warning">
            {'★'.repeat(review.rating)}
          </span>
          <span aria-hidden="true" className="text-input-border">
            {'★'.repeat(5 - review.rating)}
          </span>
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-sm">
          {c.statuses[review.status]}
        </span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{c.statusNotes[review.status]}</p>
      {review.status === 'rejected' && review.rejectionReason ? (
        <p className="mt-2 rounded-xl border border-danger bg-[#fef2f2] px-4 py-3 text-sm">
          {c.rejectionReason(review.rejectionReason)}
        </p>
      ) : null}
      <div className="mt-3">
        {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {failed}
        </p>
      ) : null}
      {confirming ? (
        <div role="alertdialog" aria-label={c.delete} className="mt-4 flex flex-col gap-3">
          <p>{c.confirmDelete}</p>
          <div className="flex gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                fetcher.submit(
                  { intent: 'delete' },
                  { method: 'post', encType: 'application/json' },
                )
              }
            >
              {busy ? c.deleting : c.confirmDeleteYes}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {c.confirmDeleteNo}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          {canEdit ? (
            <Button type="button" onClick={onEdit}>
              {c.edit}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            {c.delete}
          </Button>
        </div>
      )}
    </Shell>
  )
}
