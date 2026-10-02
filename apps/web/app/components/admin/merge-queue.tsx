import type {
  AdminMergeBook,
  AdminMergeCandidate,
  AdminMergeCandidatesResponse,
} from '@reprint/shared'
import { Button } from '@reprint/ui'
import { useId, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'

const text = copy.admin.merge

type ActionResult =
  | { done: 'dismissed'; candidateId: string }
  | {
      done: 'merged'
      candidateId: string
      moved: { reviews: number; shelfEntries: number; editions: number }
    }
  | { formError?: string; fieldErrors?: Record<string, string> }

function BookSummary({ book }: { book: AdminMergeBook }) {
  return (
    <div className="flex gap-3">
      <Cover cover={book.cover} title={book.title} size="small" />
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className="font-semibold">
          <Link to={`/books/${book.slug}`} className="underline">
            {book.title}
          </Link>
        </h4>
        <p className="text-sm text-muted-foreground">
          <span className="sr-only">{text.authorsLabel}: </span>
          {book.authors.length > 0 ? book.authors.join(', ') : text.noAuthors}
        </p>
        <p className="text-sm text-muted-foreground">
          {text.counts(book.editionCount, book.reviewCount, book.shelfEntryCount)}
        </p>
        <Link to={`/admin/books/${book.id}`} className="text-sm underline">
          {text.edit(book.title)}
        </Link>
      </div>
    </div>
  )
}

/** One candidate pair side by side, with Merge (either direction, confirmed) and Dismiss. */
function Candidate({ candidate }: { candidate: AdminMergeCandidate }) {
  const fetcher = useFetcher<ActionResult>()
  const [keep, setKeep] = useState<'a' | 'b' | null>(null)
  const headingId = useId()
  const { bookA, bookB } = candidate
  const busy = fetcher.state !== 'idle'
  const submitting = (fetcher.json as { intent?: string } | undefined)?.intent ?? null
  const result = fetcher.data
  const done = result && 'done' in result ? result : null
  const failure = result && 'formError' in result ? result.formError : undefined

  const send = (body: Record<string, unknown>) =>
    fetcher.submit(body as never, { method: 'post', encType: 'application/json' })
  const kept = keep === 'a' ? bookA : keep === 'b' ? bookB : null
  const removed = keep === 'a' ? bookB : keep === 'b' ? bookA : null

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex flex-col gap-4 rounded-lg border border-border p-4"
      >
        <header className="flex flex-col gap-1">
          <h3 id={headingId} className="font-semibold">
            {text.pairLabel(bookA.title, bookB.title)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {text.reasonLabel}: {candidate.reason}
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <BookSummary book={bookA} />
          <BookSummary book={bookB} />
        </div>
        {done ? (
          <p role="status" className="text-sm">
            {done.done === 'merged'
              ? text.merged(done.moved.reviews, done.moved.shelfEntries, done.moved.editions)
              : text.dismissed}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  ['a', bookA],
                  ['b', bookB],
                ] as const
              ).map(([side, book]) =>
                keep === null ? (
                  <Button
                    key={side}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setKeep(side)}
                  >
                    {text.keep(book.title)}
                  </Button>
                ) : null,
              )}
              {keep === null ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => send({ intent: 'dismiss', candidateId: candidate.id })}
                >
                  {busy && submitting === 'dismiss' ? text.dismissing : text.dismiss}
                </Button>
              ) : null}
            </div>
            {kept && removed ? (
              <section
                aria-label={text.confirmHeading(removed.title, kept.title)}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <p className="font-medium">{text.confirmHeading(removed.title, kept.title)}</p>
                <p className="text-sm text-muted-foreground">{text.confirmHint}</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      send({
                        intent: 'merge',
                        candidateId: candidate.id,
                        merge: { fromBookId: removed.id, intoBookId: kept.id },
                      })
                    }
                  >
                    {busy && submitting === 'merge' ? text.merging : text.confirm}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setKeep(null)}
                  >
                    {text.cancel}
                  </Button>
                </div>
              </section>
            ) : null}
          </>
        )}
        {failure ? (
          <p role="alert" className="text-sm text-danger">
            {failure}
          </p>
        ) : null}
      </article>
    </li>
  )
}

/** `/admin/catalog/merge`: possible duplicate Books, oldest first (PRD §7.11). */
export function MergeQueue({ queue }: { queue: AdminMergeCandidatesResponse }) {
  return (
    <section aria-labelledby="merge-heading" className="flex flex-col gap-4">
      <h2 id="merge-heading" className="text-2xl font-semibold">
        {text.title}
      </h2>
      {queue.items.length === 0 ? (
        <p className="text-muted-foreground">{text.empty}</p>
      ) : (
        <ul aria-label={text.listLabel} className="flex flex-col gap-4">
          {queue.items.map((candidate) => (
            <Candidate key={candidate.id} candidate={candidate} />
          ))}
        </ul>
      )}
      {queue.meta.nextCursor ? (
        <Link
          to={`/admin/catalog/merge?${new URLSearchParams({ cursor: queue.meta.nextCursor })}`}
          className="underline"
        >
          {text.next}
        </Link>
      ) : null}
    </section>
  )
}
