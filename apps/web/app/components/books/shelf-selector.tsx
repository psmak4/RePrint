import {
  resolveBookResponseSchema,
  type SetShelfInput,
  SHELVES,
  type Shelf,
  type ShelfResponse,
  shelfResponseSchema,
} from '@reprint/shared'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.shelves

/** Which Book the control is for: one RePrint stores, or a search result it has not stored yet (PRD §6). */
export type ShelfTarget = { kind: 'book'; slug: string } | { kind: 'candidate'; ref: string }

async function resolveSlug(ref: string): Promise<string> {
  const response = await fetch('/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref }),
  })
  if (!response.ok) throw new Error(`resolve failed with ${response.status}`)
  return resolveBookResponseSchema.parse(await response.json()).slug
}

async function sendShelf(slug: string, shelf: Shelf | null): Promise<ShelfResponse> {
  const body: SetShelfInput | undefined = shelf ? { shelf } : undefined
  const response = await fetch(`/books/${slug}/shelf`, {
    method: shelf ? 'PUT' : 'DELETE',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new Error(`shelf failed with ${response.status}`)
  return shelfResponseSchema.parse(await response.json())
}

/**
 * The one shelf control (PRD §7.7): shows the current Shelf, offers the three Shelves, and "Remove" once
 * the Book is on one. A Visitor gets a sign-in link instead. A candidate is stored first, then shelved.
 */
export function ShelfSelector({
  target,
  title,
  shelf: initialShelf,
  signedIn,
}: {
  target: ShelfTarget
  title: string
  /** The viewer's current Shelf; `null` or absent when the Book is on none. */
  shelf?: Shelf | null
  signedIn: boolean
}) {
  const id = useId()
  const [shelf, setShelf] = useState<Shelf | null>(initialShelf ?? null)
  // A candidate's slug is known once it has been stored; later changes reuse it.
  const [slug, setSlug] = useState(target.kind === 'book' ? target.slug : null)
  const mutation = useMutation({
    mutationFn: async (next: Shelf | null) => {
      const bookSlug = slug ?? (target.kind === 'candidate' ? await resolveSlug(target.ref) : null)
      if (bookSlug === null) throw new Error('no Book to shelve')
      setSlug(bookSlug)
      return sendShelf(bookSlug, next)
    },
    onSuccess: (result) => setShelf(result.shelf),
  })

  if (!signedIn) {
    return (
      <Link to="/login" className="text-sm text-link underline">
        {text.signIn}
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {text.label(title)}
      </label>
      <select
        id={id}
        value={shelf ?? ''}
        disabled={mutation.isPending}
        onChange={(event) => {
          const value = event.target.value
          if (value === 'remove') mutation.mutate(null)
          else if ((SHELVES as readonly string[]).includes(value)) mutation.mutate(value as Shelf)
        }}
        className="h-9 w-fit rounded-md border border-input-border bg-surface px-2 text-sm text-foreground"
      >
        {shelf === null ? <option value="">{text.none}</option> : null}
        {SHELVES.map((name) => (
          <option key={name} value={name}>
            {text[name]}
          </option>
        ))}
        {shelf !== null ? <option value="remove">{text.remove}</option> : null}
      </select>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          {text.failed}
        </p>
      ) : null}
    </div>
  )
}

/** The control for a Book RePrint stores, seeded from the response's `viewerShelf`. */
export function BookShelfSelector({
  book,
  signedIn,
}: {
  book: { slug: string; title: string; viewerShelf?: Shelf | null }
  signedIn: boolean
}) {
  return (
    <ShelfSelector
      target={{ kind: 'book', slug: book.slug }}
      title={book.title}
      shelf={book.viewerShelf}
      signedIn={signedIn}
    />
  )
}
