import type { AdminGenre, AdminSubjectRule } from '@reprint/shared'
import { Button, Checkbox, cn, Input, Label, Select, Textarea } from '@reprint/ui'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { adminCopy } from '../../copy/admin.js'
import { AdminPage } from './admin-page.js'
import { AdminCard, Badge, EmptyState, numClass, tableClass, tdClass, thClass } from './admin-ui.js'
import { AdminIcon } from './icons.js'
import { ScrollRegion } from './scroll-region.js'

const text = adminCopy.genres

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
  focusOnMount = false,
}: {
  genre?: AdminGenre
  parents: AdminGenre[]
  submitLabel: string
  busyLabel: string
  onCancel?: () => void
  /** Moves focus to Name when the form appears, for a form opened by a button elsewhere. */
  focusOnMount?: boolean
}) {
  const action = useAction()
  const ids = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusOnMount) nameRef.current?.focus()
  }, [focusOnMount])
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
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-name`}>{text.nameLabel}</Label>
          <Input
            ref={nameRef}
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
        <Select
          id={`${ids}-parent`}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">{text.topLevel}</option>
          {parentChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </Select>
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

export type GenresTab = 'genres' | 'rules'

/** `?tab=rules` opens Subject rules; anything else opens Genres (D-201). */
export function genresTabFrom(params: URLSearchParams): GenresTab {
  return params.get('tab') === 'rules' ? 'rules' : 'genres'
}

/** Parents in name order, each followed by its children; a child whose parent is gone sorts on its own. */
export function orderGenres(genres: AdminGenre[]): AdminGenre[] {
  const byName = (a: AdminGenre, b: AdminGenre) => a.name.localeCompare(b.name)
  const ids = new Set(genres.map((genre) => genre.id))
  const tops = genres
    .filter((genre) => genre.parentId === null || !ids.has(genre.parentId))
    .sort(byName)
  return tops.flatMap((top) => [
    top,
    ...genres.filter((genre) => genre.parentId === top.id).sort(byName),
  ])
}

function GenreRow({
  genre,
  genres,
  indent,
  onArchive,
}: {
  genre: AdminGenre
  genres: AdminGenre[]
  /** Draws the child connector; only when the parent's row is shown just above. */
  indent: boolean
  /** Keeps the row in view after it is archived, with its message and Restore (D-201). */
  onArchive: (id: string) => void
}) {
  const action = useAction()
  const [editing, setEditing] = useState(false)
  const parent = genres.find((candidate) => candidate.id === genre.parentId)
  return (
    <>
      <tr className={genre.archived ? 'bg-surface-tint' : undefined}>
        <td className={tdClass}>
          <span
            className={cn(
              'flex flex-col gap-0.5',
              indent &&
                'relative pl-6 before:absolute before:top-1 before:left-1.5 before:h-3 before:w-2.5 before:rounded-bl before:border-b-[1.5px] before:border-l-[1.5px] before:border-chip-border',
            )}
          >
            <span className={cn('font-semibold', genre.archived && 'text-muted-foreground')}>
              {genre.name}
            </span>
            <code className="font-mono text-xs break-all text-muted-foreground">{genre.slug}</code>
          </span>
        </td>
        <td className={cn(tdClass, 'text-muted-foreground')}>{parent?.name ?? text.topLevel}</td>
        <td className={cn(tdClass, numClass)}>{genre.bookCount}</td>
        <td className={cn(tdClass, numClass)}>{genre.ruleCount}</td>
        <td className={tdClass}>
          <span className="flex items-center justify-end gap-2">
            {genre.archived ? <Badge>{text.archivedBadge}</Badge> : null}
            {editing ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={text.edit(genre.name)}
                onClick={() => setEditing(true)}
              >
                {text.editShort}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={action.busy}
              aria-label={genre.archived ? text.restore(genre.name) : text.archive(genre.name)}
              onClick={() => {
                if (!genre.archived) onArchive(genre.id)
                action.send({
                  intent: 'editGenre',
                  genreId: genre.id,
                  changes: { archived: !genre.archived },
                })
              }}
            >
              {genre.archived ? text.restoreShort : text.archiveShort}
            </Button>
          </span>
        </td>
      </tr>
      {editing || action.done || action.formError ? (
        <tr>
          <td colSpan={5} className={cn(tdClass, 'bg-surface-tint')}>
            <div className="flex flex-col gap-3">
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
            </div>
          </td>
        </tr>
      ) : null}
    </>
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
    <>
      <p className="max-w-[640px] text-[15px] text-muted-foreground">{text.rulesHint}</p>
      <AdminCard title={text.addRule}>
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
          className="grid gap-3.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-start"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
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
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${ids}-genre`}>{text.ruleGenreLabel}</Label>
            <Select
              id={`${ids}-genre`}
              value={chosen}
              onChange={(event) => setGenreId(event.target.value)}
            >
              {live.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </Select>
            <FieldError message={addAction.fieldErrors.genreId} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
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
          <div className="sm:pt-[26px]">
            <Button type="submit" disabled={addAction.busy || chosen === ''}>
              {addAction.busy ? text.addingRule : text.addRule}
            </Button>
          </div>
          <div className="sm:col-span-4">
            <Messages action={addAction} />
          </div>
        </form>
      </AdminCard>
      <Messages action={removeAction} />
      {rules.length === 0 ? (
        <EmptyState>{text.noRules}</EmptyState>
      ) : (
        <ScrollRegion label={text.rulesLabel}>
          <table aria-label={text.rulesLabel} className={tableClass}>
            <thead>
              <tr>
                <th scope="col" className={thClass}>
                  {text.columns.pattern}
                </th>
                <th scope="col" className={thClass}>
                  {text.columns.genre}
                </th>
                <th scope="col" className={cn(thClass, 'text-right')}>
                  {text.columns.priority}
                </th>
                <th scope="col" className={thClass}>
                  <span className="sr-only">{text.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className={tdClass}>
                    <code className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[13px] break-all">
                      {rule.pattern}
                    </code>
                  </td>
                  <td className={tdClass}>{rule.genre.name}</td>
                  <td className={cn(tdClass, numClass)}>{rule.priority}</td>
                  <td className={cn(tdClass, 'text-right')}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={removeAction.busy}
                      aria-label={text.removeRule(rule.pattern)}
                      onClick={() => removeAction.send({ intent: 'removeRule', ruleId: rule.id })}
                    >
                      {text.removeShort}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </>
  )
}

const tabClass =
  'inline-flex h-12 items-center gap-2 border-b-[3px] border-transparent text-[15px] font-medium text-strong hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-foreground'

function TabCount({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full border border-border bg-surface px-2 text-xs font-semibold">
      {n}
    </span>
  )
}

/** `/admin/catalog/genres`: Genres and Subject rules as two tabs (D-201). */
export function GenreManager({
  genres,
  rules,
  tab,
}: {
  genres: AdminGenre[]
  rules: AdminSubjectRule[]
  tab: GenresTab
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // Genres archived on this visit stay listed until the page is left, so their row, message, and
  // Restore button do not vanish when the data reloads.
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set())
  const keep = (id: string) => setKept((current) => new Set(current).add(id))
  const findId = useId()
  const addCardId = useId()
  const needle = query.trim().toLowerCase()
  const shown = orderGenres(genres).filter(
    (genre) =>
      (showArchived || !genre.archived || kept.has(genre.id)) &&
      (needle === '' || genre.name.toLowerCase().includes(needle) || genre.slug.includes(needle)),
  )
  const shownIds = new Set(shown.map((genre) => genre.id))
  return (
    <AdminPage
      title={text.title}
      lead={text.lead}
      crumbs={[
        { label: adminCopy.title, to: '/admin' },
        { label: adminCopy.catalogNav, to: '/admin/catalog' },
        { label: text.title },
      ]}
      actions={
        tab === 'genres' ? (
          <Button
            type="button"
            aria-expanded={adding}
            aria-controls={adding ? addCardId : undefined}
            onClick={() => setAdding(true)}
          >
            <AdminIcon name="plus" />
            {text.addHeading}
          </Button>
        ) : null
      }
      below={
        <nav aria-label={text.tabsLabel} className="flex gap-7">
          <Link
            to="/admin/catalog/genres"
            aria-current={tab === 'genres' ? 'page' : undefined}
            className={tabClass}
          >
            {text.genresHeading}
            <TabCount n={genres.length} />
          </Link>
          <Link
            to="/admin/catalog/genres?tab=rules"
            aria-current={tab === 'rules' ? 'page' : undefined}
            className={tabClass}
          >
            {text.rulesHeading}
            <TabCount n={rules.length} />
          </Link>
        </nav>
      }
    >
      {tab === 'rules' ? (
        <RulesSection genres={genres} rules={rules} />
      ) : (
        <>
          {adding ? (
            <AdminCard id={addCardId} title={text.addHeading}>
              <GenreForm
                parents={genres}
                submitLabel={text.add}
                busyLabel={text.adding}
                onCancel={() => setAdding(false)}
                focusOnMount
              />
            </AdminCard>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor={findId} className="sr-only">
              {text.findLabel}
            </label>
            <span className="relative w-full max-w-sm">
              <AdminIcon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={findId}
                type="search"
                value={query}
                placeholder={text.findLabel}
                className="pl-10"
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
            <span className="inline-flex items-center gap-2.5">
              <Checkbox
                id={`${findId}-archived`}
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              <label htmlFor={`${findId}-archived`} className="text-[15px] font-medium">
                {text.showArchived}
              </label>
            </span>
          </div>
          {genres.length === 0 ? (
            <EmptyState>{text.empty}</EmptyState>
          ) : shown.length === 0 ? (
            <p className="text-muted-foreground">{text.noMatch}</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <ScrollRegion label={text.listLabel} className="rounded-none border-0">
                <table aria-label={text.listLabel} className={tableClass}>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>
                        {text.columns.genre}
                      </th>
                      <th scope="col" className={thClass}>
                        {text.columns.parent}
                      </th>
                      <th scope="col" className={cn(thClass, 'text-right')}>
                        {text.columns.books}
                      </th>
                      <th scope="col" className={cn(thClass, 'text-right')}>
                        {text.columns.rules}
                      </th>
                      <th scope="col" className={thClass}>
                        <span className="sr-only">{text.columns.actions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((genre) => (
                      <GenreRow
                        key={genre.id}
                        genre={genre}
                        genres={genres}
                        indent={genre.parentId !== null && shownIds.has(genre.parentId)}
                        onArchive={keep}
                      />
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className="border-t border-border bg-surface-tint px-5 py-3.5 text-sm text-muted-foreground">
                {text.shown(shown.length, genres.length)}
              </p>
            </div>
          )}
        </>
      )}
    </AdminPage>
  )
}
