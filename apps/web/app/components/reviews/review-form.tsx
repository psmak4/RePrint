import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Edition,
  type MyReview,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_HEADLINE_MAX,
  reviewInputSchema,
} from '@reprint/shared'
import { Button, Checkbox, Input, Label, Textarea } from '@reprint/ui'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useFetcher } from 'react-router'
import type { z } from 'zod'
import { copy } from '../../copy/index.js'
import { StarRatingInput } from './star-rating-input.js'

type FormInput = z.input<typeof reviewInputSchema>
type FormOutput = z.output<typeof reviewInputSchema>
export type ReviewActionResult = {
  saved?: boolean
  deleted?: boolean
  formError?: string
  fieldErrors?: Record<string, string>
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const FIELDS = ['rating', 'headline', 'body', 'hasSpoilers', 'editionId'] as const

/** Writes or edits the viewer's Review, validated with the shared schema; the book route's action saves it. */
export function ReviewForm({
  existing,
  editions,
  onSaved,
  onCancel,
}: {
  existing: MyReview | null
  editions: Edition[]
  onSaved: () => void
  onCancel?: () => void
}) {
  const c = copy.reviews.form
  const fetcher = useFetcher<ReviewActionResult>()
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(reviewInputSchema),
    defaultValues: {
      rating: existing?.rating,
      headline: existing?.headline ?? '',
      body: existing?.body ?? '',
      hasSpoilers: existing?.hasSpoilers ?? false,
      editionId: existing?.editionId ?? undefined,
    },
  })

  const serverFields = fetcher.data?.fieldErrors
  useEffect(() => {
    for (const [name, message] of Object.entries(serverFields ?? {})) {
      if ((FIELDS as readonly string[]).includes(name)) {
        setError(name as (typeof FIELDS)[number], { type: 'server', message })
      }
    }
  }, [serverFields, setError])

  const saved = fetcher.data?.saved === true && fetcher.state === 'idle'
  useEffect(() => {
    if (saved) onSaved()
  }, [saved, onSaved])

  const headlineLength = (watch('headline') ?? '').length
  const bodyLength = (watch('body') ?? '').length
  const busy = fetcher.state !== 'idle'
  const ratingError = errors.rating ? c.ratingRequired : undefined
  const headlineError = errors.headline?.message
  const bodyError = errors.body?.message
  const editionError = errors.editionId?.message

  return (
    <form
      noValidate
      className="mt-4 flex flex-col gap-5"
      onSubmit={handleSubmit((values) =>
        fetcher.submit({ intent: 'save', ...values } as never, {
          method: 'post',
          encType: 'application/json',
        }),
      )}
    >
      {fetcher.data?.formError ? (
        <p role="alert" className="rounded-md border border-danger px-3 py-2 text-sm text-danger">
          {fetcher.data.formError}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <p id="review-rating-label" className="text-sm font-medium">
          {c.ratingLabel}
        </p>
        <Controller
          control={control}
          name="rating"
          render={({ field }) => (
            <StarRatingInput
              value={field.value ?? null}
              onChange={field.onChange}
              labelledBy="review-rating-label"
              describedBy={ratingError ? 'review-rating-error' : undefined}
              invalid={ratingError ? true : undefined}
              disabled={busy}
            />
          )}
        />
        {ratingError ? (
          <p id="review-rating-error" role="alert" className="text-sm text-danger">
            {ratingError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-headline">{c.headlineLabel}</Label>
        <Input
          id="review-headline"
          aria-invalid={headlineError ? true : undefined}
          aria-describedby={[
            'review-headline-counter',
            headlineError ? 'review-headline-error' : null,
          ]
            .filter(Boolean)
            .join(' ')}
          {...register('headline')}
        />
        <p
          id="review-headline-counter"
          className={`text-sm ${headlineLength > REVIEW_HEADLINE_MAX ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {c.headlineCounter(headlineLength, REVIEW_HEADLINE_MAX)}
        </p>
        {headlineError ? (
          <p id="review-headline-error" role="alert" className="text-sm text-danger">
            {headlineError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-body">{c.bodyLabel}</Label>
        <Textarea
          id="review-body"
          rows={8}
          aria-invalid={bodyError ? true : undefined}
          aria-describedby={[
            'review-body-hint',
            'review-body-counter',
            bodyError ? 'review-body-error' : null,
          ]
            .filter(Boolean)
            .join(' ')}
          {...register('body')}
        />
        <p id="review-body-hint" className="text-sm text-muted-foreground">
          {c.bodyHint}
        </p>
        <p
          id="review-body-counter"
          className={`text-sm ${bodyLength > REVIEW_BODY_MAX ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {c.bodyCounter(bodyLength, REVIEW_BODY_MIN, REVIEW_BODY_MAX)}
        </p>
        {bodyError ? (
          <p id="review-body-error" role="alert" className="text-sm text-danger">
            {bodyError}
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="review-spoilers"
          aria-describedby="review-spoilers-hint"
          {...register('hasSpoilers')}
        />
        <div>
          <Label htmlFor="review-spoilers">{c.spoilersLabel}</Label>
          <p id="review-spoilers-hint" className="text-sm text-muted-foreground">
            {c.spoilersHint}
          </p>
        </div>
      </div>
      {editions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="review-edition">{c.editionLabel}</Label>
          <select
            id="review-edition"
            className={SELECT_CLASS}
            aria-invalid={editionError ? true : undefined}
            aria-describedby={editionError ? 'review-edition-error' : undefined}
            {...register('editionId', { setValueAs: (value: string) => value || undefined })}
          >
            <option value="">{c.editionNone}</option>
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>
                {editionLabel(edition)}
              </option>
            ))}
          </select>
          {editionError ? (
            <p id="review-edition-error" role="alert" className="text-sm text-danger">
              {editionError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? c.submitting : existing ? c.resubmit : c.submit}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            {copy.reviews.mine.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function editionLabel(edition: Edition): string {
  const parts = [
    copy.books.page.formats[edition.format],
    edition.publishedDate?.slice(0, 4),
    edition.publisherName,
  ].filter(Boolean)
  return parts.join(' · ')
}
