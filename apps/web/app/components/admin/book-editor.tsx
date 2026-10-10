import {
  type AdminBook,
  type AdminBookDetail,
  type AdminBookEdit,
  type AdminGenre,
  CONTRIBUTION_ROLES,
  type ContributionRole,
} from '@reprint/shared'
import { Button, Checkbox, Input, Label, Textarea } from '@reprint/ui'
import { useId, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'
import { Cover } from '../books/cover.js'

const text = copy.admin.book
const SELECT_CLASS =
  'h-11 rounded-[10px] border border-input-border bg-surface px-3 text-[15px] text-foreground'

type SaveResult =
  | { done: 'edit' | 'cover'; book: AdminBook }
  | { done: 'refresh' }
  | { formError?: string; fieldErrors?: Record<string, string> }

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

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

function Locked({ field, book }: { field: string; book: AdminBookDetail }) {
  if (!book.lockedFields.includes(field)) return null
  const origin = book.fieldOrigins[field]
  return (
    <span className="text-xs text-muted-foreground">
      <span className="rounded-full bg-[#ece8e0] px-2 py-0.5 font-medium text-[#334155]">
        {text.lockedBadge}
      </span>
      {origin ? ` ${text.originLine(origin.source, date.format(new Date(origin.at)))}` : null}
    </span>
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

function EditForm({ book, genres }: { book: AdminBookDetail; genres: AdminGenre[] }) {
  const fetcher = useFetcher<SaveResult>()
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
  const [nothing, setNothing] = useState(false)
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data

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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const edit = changes()
        if (Object.keys(edit).length === 0) {
          setNothing(true)
          return
        }
        setNothing(false)
        fetcher.submit(
          { intent: 'edit', changes: edit },
          { method: 'post', encType: 'application/json' },
        )
      }}
      className="flex flex-col gap-5"
    >
      <h2 className="font-serif text-2xl leading-tight font-medium">{text.fieldsHeading}</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-title`}>{text.titleLabel}</Label>
        <Input
          id={`${ids}-title`}
          value={title}
          required
          maxLength={500}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Locked field="title" book={book} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-description`}>{text.descriptionLabel}</Label>
        <Textarea
          id={`${ids}-description`}
          value={description}
          rows={6}
          maxLength={10_000}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Locked field="description" book={book} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{text.genresLegend}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {genres.map((genre) => (
            <Label key={genre.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={genreIds.has(genre.id)}
                onChange={(event) => {
                  const next = new Set(genreIds)
                  if (event.target.checked) next.add(genre.id)
                  else next.delete(genre.id)
                  setGenreIds(next)
                }}
              />
              {genre.name}
            </Label>
          ))}
        </div>
        <Locked field="genres" book={book} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{text.seriesHeading}</legend>
        {seriesRows.map((row, index) => (
          <div key={row.key} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-series-pos-${row.key}`}>{text.seriesPositionLabel}</Label>
              <Input
                id={`${ids}-series-pos-${row.key}`}
                type="number"
                step="any"
                min={0}
                value={row.position}
                onChange={(event) =>
                  setSeriesRows(
                    seriesRows.map((item, i) =>
                      i === index ? { ...item, position: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSeriesRows(seriesRows.filter((_, i) => i !== index))}
            >
              {text.removeSeries(row.name)}
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSeriesRows([...seriesRows, { key: key(), name: '', position: '' }])}
          >
            {text.addSeries}
          </Button>
        </div>
        <Locked field="series" book={book} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{text.contributionsHeading}</legend>
        {contributionRows.map((row, index) => (
          <div key={row.key} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-author-${row.key}`}>{text.authorNameLabel}</Label>
              <Input
                id={`${ids}-author-${row.key}`}
                value={row.name}
                readOnly={row.authorId !== null}
                maxLength={200}
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-role-${row.key}`}>{text.roleLabel}</Label>
              <select
                id={`${ids}-role-${row.key}`}
                value={row.role}
                className={SELECT_CLASS}
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
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={contributionRows.length === 1}
              onClick={() => setContributionRows(contributionRows.filter((_, i) => i !== index))}
            >
              {text.removeContribution(row.name)}
            </Button>
          </div>
        ))}
        <p id={`${ids}-new-author`} className="text-sm text-muted-foreground">
          {text.newAuthorHint}
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
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
        <Locked field="contributions" book={book} />
      </fieldset>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-primary`}>{text.primaryEditionLabel}</Label>
        <select
          id={`${ids}-primary`}
          value={primaryEditionId}
          className={SELECT_CLASS}
          onChange={(event) => setPrimaryEditionId(event.target.value)}
        >
          {book.primaryEditionId === null ? (
            <option value="">{text.automaticEdition}</option>
          ) : null}
          {book.editions.map((edition) => (
            <option key={edition.id} value={edition.id}>
              {text.editionOption(
                [
                  edition.isbn13,
                  edition.format,
                  edition.language,
                  edition.publisherName,
                  edition.publishedDate,
                ].filter((part): part is string => Boolean(part)),
              ) || edition.id}
            </option>
          ))}
        </select>
        <Locked field="primaryEdition" book={book} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? text.saving : text.save}
        </Button>
        <div role="status" className="text-sm">
          {result && 'done' in result && result.done === 'edit' ? text.saved : null}
          {nothing ? text.nothingChanged : null}
        </div>
      </div>
      <Failure result={result} />
    </form>
  )
}

function CoverPanel({ book }: { book: AdminBookDetail }) {
  const fetcher = useFetcher<SaveResult>()
  const fileId = useId()
  const hintId = useId()
  const [file, setFile] = useState<File | null>(null)
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data
  return (
    <section aria-label={text.coverHeading} className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl leading-tight font-medium">{text.coverHeading}</h2>
      <Cover cover={book.cover} title={book.title} size="medium" />
      <Locked field="cover" book={book} />
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
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {text.coverHint}
        </p>
        <div>
          <Button type="submit" variant="outline" disabled={busy || !file}>
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
  const busy = fetcher.state !== 'idle'
  const result = fetcher.data
  return (
    <section aria-label={text.refreshHeading} className="flex flex-col gap-2">
      <h2 className="font-serif text-2xl leading-tight font-medium">{text.refreshHeading}</h2>
      <p className="text-sm text-muted-foreground">{text.refreshHint}</p>
      <div>
        <Button
          type="button"
          variant="outline"
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
  return (
    <section aria-label={text.lockedHeading} className="flex flex-col gap-2">
      <h2 className="font-serif text-2xl leading-tight font-medium">{text.lockedHeading}</h2>
      <p className="text-sm text-muted-foreground">{text.lockedHint}</p>
      {book.lockedFields.length === 0 ? (
        <p className="text-sm">{text.noLocks}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {book.lockedFields.map((field) => {
            const origin = book.fieldOrigins[field]
            return (
              <li key={field}>
                <span className="font-medium">{text.fieldNames[field] ?? field}</span>
                {origin
                  ? `: ${text.originLine(origin.source, date.format(new Date(origin.at)))}`
                  : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** An Admin's page for one Book: edit fields, upload a Cover, choose the Primary Edition, refresh. */
export function BookEditor({ book, genres }: { book: AdminBookDetail; genres: AdminGenre[] }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]">
          {text.title}
        </h1>
        <p className="text-muted-foreground">{book.title}</p>
        <Link to={`/books/${book.slug}`} className="text-sm underline">
          {text.back}
        </Link>
      </header>
      {/* The key re-reads the Book after a save, so the form starts from what the API stored. */}
      <EditForm
        key={JSON.stringify([book.title, book.lockedFields, book.fieldOrigins])}
        book={book}
        genres={genres}
      />
      <CoverPanel book={book} />
      <RefreshPanel />
      <LockedSummary book={book} />
    </div>
  )
}
