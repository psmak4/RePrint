import { REPORT_NOTE_MAX, REVIEW_REPORT_REASONS, type ReviewReportReason } from '@reprint/shared'
import { Button, Label, Textarea } from '@reprint/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.reviews.report

type ReportResult =
  | { status: 'report_received' }
  | { formError?: string; fieldErrors?: { note?: string } }

/**
 * "Report" for a verified Member on another Member's Approved review (PRD §7.9). The caller decides
 * who sees it. The form lives in a modal `<dialog>`: a reason, plus a note that "other" requires.
 */
export function ReportReview({ reviewId }: { reviewId: string }) {
  const fetcher = useFetcher<ReportResult>()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<ReviewReportReason>('unmarked_spoiler')
  const [note, setNote] = useState('')
  const titleId = useId()
  const noteId = useId()
  const hintId = useId()
  const errorId = useId()
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data
  const received = result && 'status' in result
  const noteError = result && 'fieldErrors' in result ? result.fieldErrors?.note : undefined
  const formError = result && 'formError' in result ? result.formError : undefined
  const noteMissing = reason === 'other' && note.trim() === ''

  const open = () => {
    const dialog = dialogRef.current
    if (!dialog) return
    // jsdom has no showModal; the attribute opens the dialog everywhere.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }
  const close = () => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
  }

  useEffect(() => {
    if (received) setNote('')
  }, [received])

  const submit = () => {
    fetcher.submit(
      { reason, ...(note.trim() ? { note } : {}) },
      { method: 'post', action: `/reviews/${reviewId}/report`, encType: 'application/json' },
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-input-border px-3 py-1.5 text-sm hover:bg-surface"
      >
        {copy.reviews.list.report}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-full max-w-md rounded-lg border border-border bg-background p-4 text-foreground backdrop:bg-foreground/60"
      >
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault()
            if (!received && !noteMissing) submit()
          }}
          className="flex flex-col gap-4"
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {text.title}
          </h2>
          {received ? (
            <p role="status">{text.received}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{text.intro}</p>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">{text.reasonLegend}</legend>
                {REVIEW_REPORT_REASONS.map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reason"
                      value={value}
                      checked={reason === value}
                      onChange={() => setReason(value)}
                    />
                    {text.reasons[value]}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1">
                <Label htmlFor={noteId}>{text.noteLabel}</Label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={REPORT_NOTE_MAX}
                  required={reason === 'other'}
                  aria-invalid={noteError ? true : undefined}
                  aria-describedby={noteError ? `${hintId} ${errorId}` : hintId}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
                <p id={hintId} className="text-sm text-muted-foreground">
                  {text.noteHint(REPORT_NOTE_MAX)}
                </p>
                {noteError ? (
                  <p id={errorId} role="alert" className="text-sm text-danger">
                    {noteError}
                  </p>
                ) : null}
              </div>
              {formError ? (
                <p role="alert" className="text-sm text-danger">
                  {formError}
                </p>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap gap-3">
            {received ? null : (
              <Button type="submit" disabled={busy}>
                {busy ? text.sending : text.submit}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              {received ? text.close : text.cancel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}
