import type { AdminGenre, AdminSubjectRule } from '@reprint/shared'
import { Button, Input, Label, Textarea } from '@reprint/ui'
import { useId, useState } from 'react'
import { useFetcher } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.admin.genres

const SELECT_CLASS =
  'h-11 rounded-[10px] border border-input-border bg-surface px-3 text-[15px] text-foreground'

type ActionResult =
  | {
      done: 'created' | 'saved' | 'archived' | 'restored' | 'ruleAdded' | 'ruleRemoved'
    }
  | { formError?: string; fieldErrors?: Record<string, string> }

const doneMessage = {
  created: text.added,
  saved: text.saved,
  archived: text.archived,
  restored: text.restored,
  ruleAdded: text.ruleAdded,
  ruleRemoved: text.ruleRemoved,
}

function useAction() {
  const fetcher = useFetcher<ActionResult>()
  const result = fetcher.data
  return {
    busy: fetcher.state !== 'idle',
    intent: (fetcher.json as { intent?: string } | undefined)?.intent ?? null,
    done: result && 'done' in result ? result.done : null,
    formError: result && 'formError' in result ? result.formError : undefined,
    fieldErrors: (result && 'fieldErrors' in result ? result.fieldErrors : undefined) ?? {},
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

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null
}

/** Name, slug, description, and parent, for adding a Genre or editing one. */
function GenreForm({
  genre,
  parents,
  submitLabel,
  busyLabel,
  onCancel,
}: {
  genre?: AdminGenre
  parents: AdminGenre[]
  submitLabel: string
  busyLabel: string
  onCancel?: () => void
}) {
  const action = useAction()
  const ids = useId()
  const [name, setName] = useState(genre?.name ?? '')
  const [slug, setSlug] = useState(genre?.slug ?? '')
  const [description, setDescription] = useState(genre?.description ?? '')
  const [parentId, setParentId] = useState(genre?.parentId ?? '')
  const parentChoices = parents.filter(
    (candidate) => candidate.parentId === null && !candidate.archived && candidate.id !== genre?.id,
  )

  const submit = () => {
    const values = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() === '' ? null : description.trim(),
      parentId: parentId === '' ? null : parentId,
    }
    if (!genre) {
      action.send({ intent: 'createGenre', genre: values })
      return
    }
    // Only what changed goes out; the API rejects an edit with no changes.
    const changes: Record<string, unknown> = {}
    if (values.name !== genre.name) changes.name = values.name
    if (values.slug !== genre.slug) changes.slug = values.slug
    if (values.description !== genre.description) changes.description = values.description
    if (values.parentId !== genre.parentId) changes.parentId = values.parentId
    if (Object.keys(changes).length === 0) {
      onCancel?.()
      return
    }
    action.send({ intent: 'editGenre', genreId: genre.id, changes })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-name`}>{text.nameLabel}</Label>
          <Input
            id={`${ids}-name`}
            value={name}
            required
            maxLength={100}
            aria-invalid={action.fieldErrors.name ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldError message={action.fieldErrors.name} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-slug`}>{text.slugLabel}</Label>
          <Input
            id={`${ids}-slug`}
            value={slug}
            required
            maxLength={80}
            aria-describedby={`${ids}-slug-hint`}
            aria-invalid={action.fieldErrors.slug ? true : undefined}
            onChange={(event) => setSlug(event.target.value)}
          />
          <p id={`${ids}-slug-hint`} className="text-sm text-muted-foreground">
            {text.slugHint}
          </p>
          <FieldError message={action.fieldErrors.slug} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-description`}>{text.descriptionLabel}</Label>
        <Textarea
          id={`${ids}-description`}
          value={description}
          rows={2}
          maxLength={1000}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldError message={action.fieldErrors.description} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${ids}-parent`}>{text.parentLabel}</Label>
        <select
          id={`${ids}-parent`}
          value={parentId}
          className={SELECT_CLASS}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">{text.topLevel}</option>
          {parentChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
        <FieldError message={action.fieldErrors.parentId} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={action.busy}>
          {action.busy ? busyLabel : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={action.busy} onClick={onCancel}>
            {text.cancel}
          </Button>
        ) : null}
      </div>
      <Messages action={action} />
    </form>
  )
}

function GenreRow({ genre, genres }: { genre: AdminGenre; genres: AdminGenre[] }) {
  const action = useAction()
  const [editing, setEditing] = useState(false)
  const parent = genres.find((candidate) => candidate.id === genre.parentId)
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            {parent ? `${parent.name} › ` : ''}
            {genre.name}
            {genre.archived ? (
              <span className="ml-2 rounded-full bg-[#ece8e0] px-2.5 py-0.5 text-xs font-medium text-[#334155]">
                {text.archivedBadge}
              </span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {genre.slug} · {text.counts(genre.bookCount, genre.ruleCount)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {editing ? null : (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              {text.edit(genre.name)}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              action.send({
                intent: 'editGenre',
                genreId: genre.id,
                changes: { archived: !genre.archived },
              })
            }
          >
            {genre.archived ? text.restore(genre.name) : text.archive(genre.name)}
          </Button>
        </div>
      </div>
      {editing ? (
        <GenreForm
          genre={genre}
          parents={genres}
          submitLabel={text.save}
          busyLabel={text.saving}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      <Messages action={action} />
    </li>
  )
}

function RulesSection({ genres, rules }: { genres: AdminGenre[]; rules: AdminSubjectRule[] }) {
  const addAction = useAction()
  const removeAction = useAction()
  const ids = useId()
  const [pattern, setPattern] = useState('')
  const [genreId, setGenreId] = useState('')
  const [priority, setPriority] = useState('50')
  const live = genres.filter((genre) => !genre.archived)
  const chosen = genreId || live[0]?.id || ''
  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-3">
      <h3 id="rules-heading" className="font-serif text-2xl leading-tight font-medium">
        {text.rulesHeading}
      </h3>
      <p className="text-sm text-muted-foreground">{text.rulesHint}</p>
      {rules.length === 0 ? (
        <p className="text-muted-foreground">{text.noRules}</p>
      ) : (
        <ul aria-label={text.rulesLabel} className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm"
            >
              <span>
                <span className="font-medium">{rule.pattern}</span> → {rule.genre.name} ·{' '}
                {text.priority(rule.priority)}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={removeAction.busy}
                onClick={() => removeAction.send({ intent: 'removeRule', ruleId: rule.id })}
              >
                {text.removeRule(rule.pattern)}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Messages action={removeAction} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          addAction.send({
            intent: 'addRule',
            rule: {
              pattern: pattern.trim(),
              genreId: chosen,
              priority: Number(priority),
            },
          })
          setPattern('')
        }}
        className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-pattern`}>{text.patternLabel}</Label>
          <Input
            id={`${ids}-pattern`}
            value={pattern}
            required
            maxLength={200}
            aria-invalid={addAction.fieldErrors.pattern ? true : undefined}
            onChange={(event) => setPattern(event.target.value)}
          />
          <FieldError message={addAction.fieldErrors.pattern} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-genre`}>{text.ruleGenreLabel}</Label>
          <select
            id={`${ids}-genre`}
            value={chosen}
            className={SELECT_CLASS}
            onChange={(event) => setGenreId(event.target.value)}
          >
            {live.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
          <FieldError message={addAction.fieldErrors.genreId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-priority`}>{text.priorityLabel}</Label>
          <Input
            id={`${ids}-priority`}
            type="number"
            min={0}
            max={1000}
            step={1}
            value={priority}
            required
            aria-invalid={addAction.fieldErrors.priority ? true : undefined}
            onChange={(event) => setPriority(event.target.value)}
          />
          <FieldError message={addAction.fieldErrors.priority} />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <div>
            <Button type="submit" disabled={addAction.busy || chosen === ''}>
              {addAction.busy ? text.addingRule : text.addRule}
            </Button>
          </div>
          <Messages action={addAction} />
        </div>
      </form>
    </section>
  )
}

/** `/admin/catalog/genres`: add, edit, archive, and restore Genres, and manage Subject rules. */
export function GenreManager({
  genres,
  rules,
}: {
  genres: AdminGenre[]
  rules: AdminSubjectRule[]
}) {
  return (
    <section aria-labelledby="genres-heading" className="flex flex-col gap-6">
      <h2
        id="genres-heading"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.title}
      </h2>
      <section aria-labelledby="genre-list-heading" className="flex flex-col gap-3">
        <h3 id="genre-list-heading" className="font-serif text-2xl leading-tight font-medium">
          {text.genresHeading}
        </h3>
        {genres.length === 0 ? (
          <p className="text-muted-foreground">{text.empty}</p>
        ) : (
          <ul aria-label={text.listLabel} className="flex flex-col gap-3">
            {genres.map((genre) => (
              <GenreRow key={genre.id} genre={genre} genres={genres} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="genre-add-heading" className="flex flex-col gap-3">
        <h3 id="genre-add-heading" className="font-serif text-2xl leading-tight font-medium">
          {text.addHeading}
        </h3>
        <GenreForm parents={genres} submitLabel={text.add} busyLabel={text.adding} />
      </section>
      <RulesSection genres={genres} rules={rules} />
    </section>
  )
}
