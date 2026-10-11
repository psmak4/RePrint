import {
  type AdminFeatured,
  type AdminFeaturedGenre,
  DISCOVER_FEATURED_GENRES,
  type FeaturedReview,
} from '@reprint/shared'
import { Button, Label, Select } from '@reprint/ui'
import { useId, useState } from 'react'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.admin.featured

type ActionResult =
  | { done: 'genresSaved' | 'reviewSaved' | 'reviewCleared' }
  | { formError?: string }

const doneMessage = {
  genresSaved: text.genresSaved,
  reviewSaved: text.reviewSaved,
  reviewCleared: text.reviewCleared,
}

function useAction() {
  const fetcher = useFetcher<ActionResult>()
  const result = fetcher.data
  return {
    busy: fetcher.state !== 'idle',
    done: result && 'done' in result ? result.done : null,
    formError: result && 'formError' in result ? result.formError : undefined,
    send: (body: Record<string, unknown>) =>
      fetcher.submit(body as never, { method: 'post', encType: 'application/json' }),
  }
}

function Messages({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      {action.done ? (
        <p role="status" className="text-sm">
          {doneMessage[action.done]}
        </p>
      ) : null}
      {action.formError ? (
        <p role="alert" className="text-sm text-danger">
          {action.formError}
        </p>
      ) : null}
    </>
  )
}

function GenrePicker({
  initial,
  options,
  canEdit,
}: {
  initial: AdminFeaturedGenre[]
  options: AdminFeaturedGenre[]
  canEdit: boolean
}) {
  const action = useAction()
  const selectId = useId()
  const [picked, setPicked] = useState(initial)
  const [choice, setChoice] = useState('')
  const available = options.filter((option) => !picked.some((genre) => genre.id === option.id))
  const full = picked.length >= DISCOVER_FEATURED_GENRES

  const move = (index: number, by: -1 | 1) => {
    const next = [...picked]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(index + by, 0, item)
    setPicked(next)
  }
  const add = () => {
    const genre = options.find((option) => option.id === choice)
    if (!genre || full) return
    setPicked([...picked, genre])
    setChoice('')
  }

  return (
    <section aria-labelledby="featured-genres-heading" className="flex flex-col gap-3">
      <h3 id="featured-genres-heading" className="font-serif text-2xl leading-tight font-medium">
        {text.genresHeading}
      </h3>
      <p className="text-sm text-muted-foreground">
        {canEdit ? text.genresHint(DISCOVER_FEATURED_GENRES) : text.genresReadOnly}
      </p>
      {picked.length === 0 ? (
        <p>{text.noGenres}</p>
      ) : (
        <ol aria-label={text.genresLabel} className="flex flex-col gap-2">
          {picked.map((genre, index) => (
            <li
              key={genre.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2"
            >
              <span className="flex-1 font-medium">{genre.name}</span>
              {canEdit ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    aria-label={text.moveUp(genre.name)}
                    onClick={() => move(index, -1)}
                  >
                    {text.up}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={index === picked.length - 1}
                    aria-label={text.moveDown(genre.name)}
                    onClick={() => move(index, 1)}
                  >
                    {text.down}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={text.remove(genre.name)}
                    onClick={() => setPicked(picked.filter((item) => item.id !== genre.id))}
                  >
                    {text.removeShort}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {canEdit ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={selectId}>{text.addLabel}</Label>
              <Select
                id={selectId}
                value={choice}
                disabled={full}
                onChange={(event) => setChoice(event.target.value)}
              >
                <option value="">{text.addPlaceholder}</option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="button" variant="outline" disabled={!choice || full} onClick={add}>
              {text.add}
            </Button>
          </div>
          {full ? <p className="text-sm">{text.full(DISCOVER_FEATURED_GENRES)}</p> : null}
          <div>
            <Button
              type="button"
              disabled={action.busy}
              onClick={() => action.send({ genreIds: picked.map((genre) => genre.id) })}
            >
              {action.busy ? text.saving : text.saveGenres}
            </Button>
          </div>
          <Messages action={action} />
        </>
      ) : null}
    </section>
  )
}

function ReviewCard({ item }: { item: FeaturedReview }) {
  const { review, book } = item
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">
        {text.byline(review.rating, review.author.displayName, book.title)}
      </p>
      {review.headline ? <p className="font-semibold">{review.headline}</p> : null}
      <p className="line-clamp-3 text-sm whitespace-pre-line">{review.body}</p>
    </div>
  )
}

function ReviewPicker({
  current,
  candidates,
}: {
  current: FeaturedReview | null
  candidates: FeaturedReview[]
}) {
  const action = useAction()
  return (
    <section aria-labelledby="featured-review-heading" className="flex flex-col gap-3">
      <h3 id="featured-review-heading" className="font-serif text-2xl leading-tight font-medium">
        {text.reviewHeading}
      </h3>
      <p className="text-sm text-muted-foreground">{text.reviewHint}</p>
      {current ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <ReviewCard item={current} />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={action.busy}
              onClick={() => action.send({ reviewId: null })}
            >
              {action.busy ? text.clearing : text.clear}
            </Button>
          </div>
        </div>
      ) : (
        <p>{text.noReview}</p>
      )}
      <Messages action={action} />
      <h4 className="text-lg font-semibold">{text.candidatesHeading}</h4>
      {candidates.length === 0 ? (
        <p>{text.noCandidates}</p>
      ) : (
        <ul aria-label={text.candidatesLabel} className="flex flex-col gap-2">
          {candidates.map((item) => (
            <li
              key={item.review.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
            >
              <ReviewCard item={item} />
              <div>
                {current?.review.id === item.review.id ? (
                  <p className="text-sm font-medium">{text.current}</p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={action.busy}
                    aria-label={text.feature(item.book.title)}
                    onClick={() => action.send({ reviewId: item.review.id })}
                  >
                    {text.featureShort}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The Discover page's featured Genres (Admins) and featured review (PRD §7.2, §7.11, D-045). */
export function FeaturedManager({
  featured,
  canEditGenres,
}: {
  featured: AdminFeatured
  canEditGenres: boolean
}) {
  return (
    <section aria-labelledby="featured-heading" className="flex flex-col gap-8">
      <h2
        id="featured-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <GenrePicker
        initial={featured.genres}
        options={featured.genreOptions}
        canEdit={canEditGenres}
      />
      <ReviewPicker current={featured.review} candidates={featured.candidates} />
    </section>
  )
}
