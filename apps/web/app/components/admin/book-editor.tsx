import {
  type AdminBook,
  type AdminBookDetail,
  type AdminBookEdit,
  type AdminGenre,
  CONTRIBUTION_ROLES,
  type ContributionRole,
} from '@reprint/shared'
import { Button, Checkbox, cn, Input, Label, Select, Textarea } from '@reprint/ui'
import { type ReactNode, useId, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'

const text = copy.admin.book
const formats = copy.books.page.formats
const CARD = 'flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 md:p-6'
const CARD_HEADING = 'font-serif text-xl leading-tight font-medium'
/** The edit form's fetcher outlives the form, which remounts after a save with the stored Book. */
const EDIT_FETCHER = 'admin-book-edit'

type SaveResult =
  | { done: 'edit' | 'cover'; book: AdminBook }
  | { done: 'refresh' }
  | { formError?: string; fieldErrors?: Record<string, string> }

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const languageName = (code: string) =>
  new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code

function Failure({ result }: { result: SaveResult | undefined }) {
  if (!result || 'done' in result) return null
  const messages = [result.formError, ...Object.values(result.fieldErrors ?? {})].filter(Boolean)
  if (messages.length === 0) return null
  return (
    <div role="alert" className="text-sm text-danger">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

/** A locked field's badge and who set it, shown beside the field's heading. */
function Locked({ field, book }: { field: string; book: AdminBookDetail }) {
  if (!book.lockedFields.includes(field)) return null
  const origin = book.fieldOrigins[field]
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1 rounded-full bg-[#ece8e0] px-2 py-0.5 font-medium text-[#334155]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        {text.lockedBadge}
      </span>
      {origin ? text.originLine(origin.source, date.format(new Date(origin.at))) : null}
    </span>
  )
}

/** A card in the form column: a heading with the field's lock beside it, then the controls. */
function Card({
  heading,
  headingId,
  aside,
  children,
}: {
  heading: string
  headingId: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className={CARD_HEADING}>
          {heading}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A small round button with an icon and a full accessible name, for removing a row. */
function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-input-border bg-surface text-[#334155] hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  )
}

interface SeriesRow {
  key: number
  name: string
  position: string
}
interface ContributionRow {
  key: number
  authorId: string | null
  name: string
  role: ContributionRole
}

const toPosition = (value: string): number | null => {
  const trimmed = value.trim()
  return trimmed === '' || Number.isNaN(Number(trimmed)) ? null : Number(trimmed)
}

function EditForm({
  book,
  genres,
  onDiscard,
}: {
  book: AdminBookDetail
  genres: AdminGenre[]
  onDiscard: () => void
}) {
  const fetcher = useFetcher<SaveResult>({ key: EDIT_FETCHER })
  const ids = useId()
  const nextKey = useRef(0)
  const key = () => nextKey.current++
  const [title, setTitle] = useState(book.title)
  const [description, setDescription] = useState(book.description ?? '')
  const [genreIds, setGenreIds] = useState(() => new Set(book.genres.map((genre) => genre.id)))
  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>(() =>
    book.series.map((item) => ({
      key: key(),
      name: item.name,
      position: item.position === null ? '' : String(item.position),
    })),
  )
  const [contributionRows, setContributionRows] = useState<ContributionRow[]>(() =>
    book.contributions.map((item) => ({
      key: key(),
      authorId: item.authorId,
      name: item.name,
      role: item.role,
    })),
  )
  const [primaryEditionId, setPrimaryEditionId] = useState(book.primaryEditionId ?? '')
  const busy = fetcher.state !== 'idle'

  // Only fields that changed are sent, because every field sent becomes locked.
  function changes(): AdminBookEdit {
    const edit: AdminBookEdit = {}
    if (title.trim() !== book.title) edit.title = title
    if ((description.trim() || null) !== book.description) edit.description = description || null
    const before = book.genres.map((genre) => genre.id)
    if (genreIds.size !== before.length || before.some((id) => !genreIds.has(id))) {
      edit.genreIds = [...genreIds]
    }
    const series = seriesRows
      .filter((row) => row.name.trim() !== '')
      .map((row) => ({ name: row.name.trim(), position: toPosition(row.position) }))
    const seriesBefore = book.series.map((item) => ({ name: item.name, position: item.position }))
    if (JSON.stringify(series) !== JSON.stringify(seriesBefore)) edit.series = series
    const contributions = contributionRows
      .filter((row) => row.authorId !== null || row.name.trim() !== '')
      .map((row) =>
        row.authorId
          ? { authorId: row.authorId, role: row.role }
          : { name: row.name.trim(), role: row.role },
      )
    const contributionsBefore = book.contributions.map((item) => ({
      authorId: item.authorId,
      role: item.role,
    }))
    if (JSON.stringify(contributions) !== JSON.stringify(contributionsBefore)) {
      edit.contributions = contributions
    }
    if (primaryEditionId !== '' && primaryEditionId !== book.primaryEditionId) {
      edit.primaryEditionId = primaryEditionId
    }
    return edit
  }

  const pending = changes()
  const dirty = Object.keys(pending).length > 0
  const toggleGenre = (id: string, on: boolean) => {
    const next = new Set(genreIds)
    if (on) next.add(id)
    else next.delete(id)
    setGenreIds(next)
  }
  const chosenGenres = genres.filter((genre) => genreIds.has(genre.id))
  // The current Primary Edition first, so it is in view without scrolling.
  const editions = [...book.editions].sort(
    (a, b) => Number(b.id === book.primaryEditionId) - Number(a.id === book.primaryEditionId),
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        // Enter in a field submits too; with nothing changed there is nothing to send.
        if (!dirty) return
        fetcher.submit(
          { intent: 'edit', changes: pending },
          { method: 'post', encType: 'application/json' },
        )
      }}
      className="flex flex-col gap-5"
    >
      <Card heading={text.fieldsHeading} headingId={`${ids}-details`}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Label htmlFor={`${ids}-title`}>{text.titleLabel}</Label>
            <Locked field="title" book={book} />
          </div>
          <Input
            id={`${ids}-title`}
            value={title}
            required
            maxLength={500}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Label htmlFor={`${ids}-description`}>{text.descriptionLabel}</Label>
            <Locked field="description" book={book} />
          </div>
          <Textarea
            id={`${ids}-description`}
            value={description}
            rows={8}
            maxLength={10_000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </Card>

      <Card
        heading={text.genresLegend}
        headingId={`${ids}-genres`}
        aside={<Locked field="genres" book={book} />}
      >
        {chosenGenres.length > 0 ? (
          <ul aria-label={text.chosenGenresLabel} className="flex flex-wrap gap-2">
            {chosenGenres.map((genre) => (
              <li key={genre.id}>
                <span className="inline-flex h-[34px] items-center gap-1 rounded-full border border-accent bg-accent/10 pr-1 pl-3.5 text-sm font-medium text-foreground">
                  {genre.name}
                  <button
                    type="button"
                    aria-label={text.removeGenre(genre.name)}
                    onClick={() => toggleGenre(genre.id, false)}
                    className="inline-flex size-7 items-center justify-center rounded-full hover:bg-accent/15"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{text.noGenres}</p>
        )}
        <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
          <legend className="sr-only">{text.allGenresLegend}</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
            {genres.map((genre) => (
              <Label key={genre.id} className="flex items-center gap-2 text-sm font-normal">
                <Checkbox
                  checked={genreIds.has(genre.id)}
                  onChange={(event) => toggleGenre(genre.id, event.target.checked)}
                />
                {genre.name}
              </Label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card
        heading={text.seriesHeading}
        headingId={`${ids}-series`}
        aside={<Locked field="series" book={book} />}
      >
        {seriesRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noSeries}</p>
        ) : null}
        {seriesRows.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`${ids}-series-${row.key}`}>{text.seriesNameLabel}</Label>
              <Input
                id={`${ids}-series-${row.key}`}
                value={row.name}
                maxLength={200}
                onChange={(event) =>
                  setSeriesRows(
                    seriesRows.map((item, i) =>
                      i === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-series-pos-${row.key}`}>{text.seriesPositionLabel}</Label>
              <Input
                id={`${ids}-series-pos-${row.key}`}
                type="number"
                step="any"
                min={0}
                value={row.position}
                aria-describedby={`${ids}-series-hint`}
                onChange={(event) =>
                  setSeriesRows(
                    seriesRows.map((item, i) =>
                      i === index ? { ...item, position: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <RemoveButton
              label={text.removeSeries(row.name)}
              onClick={() => setSeriesRows(seriesRows.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        {seriesRows.length > 0 ? (
          <p id={`${ids}-series-hint`} className="text-sm text-muted-foreground">
            {text.seriesPositionHint}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSeriesRows([...seriesRows, { key: key(), name: '', position: '' }])}
          >
            {text.addSeries}
          </Button>
        </div>
      </Card>

      <Card
        heading={text.contributionsHeading}
        headingId={`${ids}-contributions`}
        aside={<Locked field="contributions" book={book} />}
      >
        {contributionRows.map((row, index) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
          >
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
              <Label htmlFor={`${ids}-author-${row.key}`}>{text.authorNameLabel}</Label>
              <Input
                id={`${ids}-author-${row.key}`}
                value={row.name}
                readOnly={row.authorId !== null}
                maxLength={200}
                className={row.authorId !== null ? 'bg-surface-raised' : undefined}
                aria-describedby={row.authorId === null ? `${ids}-new-author` : undefined}
                onChange={(event) =>
                  setContributionRows(
                    contributionRows.map((item, i) =>
                      i === index ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-role-${row.key}`}>{text.roleLabel}</Label>
              <Select
                id={`${ids}-role-${row.key}`}
                value={row.role}
                className="w-full"
                onChange={(event) =>
                  setContributionRows(
                    contributionRows.map((item, i) =>
                      i === index
                        ? { ...item, role: event.target.value as ContributionRole }
                        : item,
                    ),
                  )
                }
              >
                {CONTRIBUTION_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {text.roles[role]}
                  </option>
                ))}
              </Select>
            </div>
            <RemoveButton
              label={text.removeContribution(row.name)}
              disabled={contributionRows.length === 1}
              onClick={() => setContributionRows(contributionRows.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        <p id={`${ids}-new-author`} className="text-sm text-muted-foreground">
          {text.newAuthorHint}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setContributionRows([
                ...contributionRows,
                { key: key(), authorId: null, name: '', role: 'author' },
              ])
            }
          >
            {text.addContribution}
          </Button>
        </div>
      </Card>

      <Card
        heading={text.primaryEditionLabel}
        headingId={`${ids}-primary`}
        aside={<Locked field="primaryEdition" book={book} />}
      >
        {editions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{text.noEditions}</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm text-muted-foreground">
              {text.primaryEditionHint(editions.length)}
            </legend>
            <div className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-1">
              {book.primaryEditionId === null ? (
                <EditionChoice
                  name={`${ids}-primary-edition`}
                  checked={primaryEditionId === ''}
                  onChange={() => setPrimaryEditionId('')}
                  heading={text.automaticEdition}
                  lines={[text.automaticHint]}
                />
              ) : null}
              {editions.map((edition) => (
                <EditionChoice
                  key={edition.id}
                  name={`${ids}-primary-edition`}
                  checked={primaryEditionId === edition.id}
                  onChange={() => setPrimaryEditionId(edition.id)}
                  heading={[formats[edition.format], edition.publishedDate?.slice(0, 4)]
                    .filter(Boolean)
                    .join(' · ')}
                  tag={edition.id === book.primaryEditionId ? text.currentEdition : null}
                  lines={[
                    edition.publisherName,
                    [
                      edition.isbn13 ? copy.books.page.isbn(edition.isbn13) : null,
                      edition.language ? languageName(edition.language) : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ]}
                />
              ))}
            </div>
          </fieldset>
        )}
      </Card>

      {dirty || busy ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
          <p className="text-sm font-semibold">{text.unsaved}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onDiscard}>
              {text.discard}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? text.saving : text.save}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  )
}

/** One Edition as a radio choice: its format and year, then publisher, ISBN, and language. */
function EditionChoice({
  name,
  checked,
  onChange,
  heading,
  tag = null,
  lines,
}: {
  name: string
  checked: boolean
  onChange: () => void
  heading: string
  tag?: string | null
  lines: (string | null)[]
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3',
        checked
          ? 'border-accent bg-accent/5 shadow-[inset_0_0_0_1px_var(--color-accent)]'
          : 'border-border hover:border-input-border',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-accent"
      />
      <span className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {heading}
          {tag ? (
            <span className="rounded-full bg-[#ece8e0] px-2 py-0.5 text-xs font-medium text-[#334155]">
              {tag}
            </span>
          ) : null}
        </span>
        {lines
          .filter((line): line is string => Boolean(line))
          .map((line) => (
            <span key={line} className="break-words text-muted-foreground">
              {line}
            </span>
          ))}
      </span>
    </label>
  )
}

function CoverPanel({ book }: { book: AdminBookDetail }) {
  const fetcher = useFetcher<SaveResult>()
  const fileId = useId()
  const hintId = useId()
  const headingId = useId()
  const [file, setFile] = useState<File | null>(null)
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className={CARD_HEADING}>
          {text.coverHeading}
        </h2>
        <Locked field="cover" book={book} />
      </div>
      <Cover cover={book.cover} title={book.title} slug={book.slug} size="medium" />
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!file) return
          const body = new FormData()
          body.set('file', file)
          fetcher.submit(body, { method: 'post', encType: 'multipart/form-data' })
        }}
      >
        <Label htmlFor={fileId}>{text.coverFileLabel}</Label>
        <input
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby={hintId}
          className="text-sm file:mr-3 file:h-10 file:rounded-full file:border file:border-input-border file:bg-surface file:px-4 file:text-sm file:font-semibold"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {text.coverHint}
        </p>
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={busy || !file}>
            {busy ? text.coverUploading : text.coverUpload}
          </Button>
        </div>
        <div role="status" className="text-sm">
          {result && 'done' in result && result.done === 'cover' ? text.coverUploaded : null}
        </div>
        <Failure result={result} />
      </form>
    </section>
  )
}

function RefreshPanel() {
  const fetcher = useFetcher<SaveResult>()
  const headingId = useId()
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <h2 id={headingId} className={CARD_HEADING}>
        {text.refreshHeading}
      </h2>
      <p className="text-sm text-muted-foreground">{text.refreshHint}</p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            fetcher.submit({ intent: 'refresh' }, { method: 'post', encType: 'application/json' })
          }
        >
          {busy ? text.refreshing : text.refresh}
        </Button>
      </div>
      <div role="status" className="text-sm">
        {result && 'done' in result && result.done === 'refresh' ? text.refreshQueued : null}
      </div>
      <Failure result={result} />
    </section>
  )
}

function LockedSummary({ book }: { book: AdminBookDetail }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <h2 id={headingId} className={CARD_HEADING}>
        {text.lockedHeading}
      </h2>
      <p className="text-sm text-muted-foreground">{text.lockedHint}</p>
      {book.lockedFields.length === 0 ? (
        <p className="text-sm">{text.noLocks}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {book.lockedFields.map((field) => {
            const origin = book.fieldOrigins[field]
            return (
              <li key={field} className="flex flex-col">
                <span className="font-medium">{text.fieldNames[field] ?? field}</span>
                {origin ? (
                  <span className="text-muted-foreground">
                    {text.originLine(origin.source, date.format(new Date(origin.at)))}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Whether the last save worked; it sits outside the form, which remounts after a save. */
function SaveStatus() {
  const fetcher = useFetcher<SaveResult>({ key: EDIT_FETCHER })
  const result = fetcher.data
  return (
    <>
      <div role="status" className="text-sm">
        {fetcher.state === 'idle' && result && 'done' in result && result.done === 'edit'
          ? text.saved
          : null}
      </div>
      <Failure result={result} />
    </>
  )
}

/** An Admin's page for one Book: edit fields, upload a Cover, choose the Primary Edition, refresh. */
export function BookEditor({ book, genres }: { book: AdminBookDetail; genres: AdminGenre[] }) {
  // Discard remounts the form, which starts again from the stored Book.
  const [generation, setGeneration] = useState(0)
  const authors = book.contributions
    .filter((item) => item.role === 'author' || item.role === 'co_author')
    .map((item) => item.name)
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4 md:gap-5">
        <Cover
          cover={book.cover}
          title={book.title}
          authorName={authors[0]}
          slug={book.slug}
          size="small"
          className="w-14 md:w-16"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {text.title}
          </p>
          <h1 className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] break-words md:text-[32px]">
            {book.title}
          </h1>
          {authors.length > 0 ? (
            <p className="text-sm text-[#334155]">{authors.join(', ')}</p>
          ) : null}
          <SaveStatus />
        </div>
        <Link
          to={`/books/${book.slug}`}
          className="hidden h-10 shrink-0 items-center rounded-full border border-input-border bg-surface px-4 text-sm font-semibold hover:bg-surface-raised sm:inline-flex"
        >
          {text.back}
        </Link>
      </header>
      <Link to={`/books/${book.slug}`} className="-mt-3 text-sm text-link underline sm:hidden">
        {text.back}
      </Link>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        {/* The key re-reads the Book after a save, so the form starts from what the API stored. */}
        <EditForm
          key={JSON.stringify([book.title, book.lockedFields, book.fieldOrigins, generation])}
          book={book}
          genres={genres}
          onDiscard={() => setGeneration(generation + 1)}
        />
        <aside className="flex flex-col gap-5 xl:sticky xl:top-6">
          <CoverPanel book={book} />
          <RefreshPanel />
          <LockedSummary book={book} />
        </aside>
      </div>
    </div>
  )
}
