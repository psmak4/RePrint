import {
  resolveBookResponseSchema,
  type SetShelfInput,
  SHELVES,
  type Shelf,
  type ShelfResponse,
  shelfResponseSchema,
} from '@reprint/shared'
import { cn } from '@reprint/ui'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ANALYTICS_EVENTS, trackEvent } from '../../lib/analytics.js'

const text = copy.shelves

/**
 * How the control looks: `link` (plain text link, the default), `icon` (a round bookmark that sits
 * on a cover), `outline` (a bordered pill), or `primary` (the blue pill on the Book page header).
 * The native `<select>` stays the control in every variant, so keyboard and screen reader use is
 * unchanged; in the pill and icon variants it is laid over the drawn button.
 */
export type ShelfVariant = 'link' | 'icon' | 'outline' | 'primary'

function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('size-[18px] shrink-0', className)}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

const PILL = {
  outline: 'border border-input-border bg-surface text-foreground hover:bg-surface-raised',
  primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
} as const

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
  variant = 'link',
}: {
  target: ShelfTarget
  title: string
  variant?: ShelfVariant
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
    onSuccess: (result) => {
      setShelf(result.shelf)
      if (result.shelf) trackEvent(ANALYTICS_EVENTS.shelfAdded, { shelf: result.shelf })
    },
  })

  if (!signedIn) {
    if (variant === 'icon') {
      return (
        <Link
          to="/login"
          aria-label={text.signInFor(title)}
          className="inline-flex size-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] text-foreground shadow-[0_2px_6px_rgba(15,23,42,0.2)] hover:bg-surface"
        >
          <BookmarkIcon filled={false} />
        </Link>
      )
    }
    if (variant === 'outline' || variant === 'primary') {
      return (
        <Link
          to="/login"
          className={cn(
            'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold whitespace-nowrap',
            PILL[variant],
          )}
        >
          <BookmarkIcon filled={false} />
          {text.none}
        </Link>
      )
    }
    return (
      <Link to="/login" className="text-sm text-link underline">
        {text.signIn}
      </Link>
    )
  }

  const select = (
    <select
      id={id}
      value={shelf ?? ''}
      disabled={mutation.isPending}
      onChange={(event) => {
        const value = event.target.value
        if (value === 'remove') mutation.mutate(null)
        else if ((SHELVES as readonly string[]).includes(value)) mutation.mutate(value as Shelf)
      }}
      className={
        variant === 'link'
          ? 'h-9 w-fit rounded-full border border-input-border bg-surface px-3 text-sm text-foreground'
          : // Invisible but on top: the drawn button shows the state, the select takes the input.
            'absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-wait'
      }
    >
      {shelf === null ? <option value="">{text.none}</option> : null}
      {SHELVES.map((name) => (
        <option key={name} value={name}>
          {text[name]}
        </option>
      ))}
      {shelf !== null ? <option value="remove">{text.remove}</option> : null}
    </select>
  )
  const label = (
    <label htmlFor={id} className="sr-only">
      {text.label(title)}
    </label>
  )
  const error = mutation.isError ? (
    <p role="alert" className="text-sm text-danger">
      {text.failed}
    </p>
  ) : null

  if (variant === 'icon') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="relative inline-flex size-9 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] text-foreground shadow-[0_2px_6px_rgba(15,23,42,0.2)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:bg-surface">
          <BookmarkIcon filled={shelf !== null} className={shelf ? 'text-accent' : ''} />
          {label}
          {select}
        </div>
        {error}
      </div>
    )
  }

  if (variant === 'outline' || variant === 'primary') {
    return (
      <div className="flex flex-col gap-1">
        <div
          className={cn(
            'relative inline-flex h-11 w-fit items-center gap-2 rounded-full pr-4 pl-[18px] text-[15px] font-semibold whitespace-nowrap focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
            PILL[variant],
          )}
        >
          <BookmarkIcon filled={shelf !== null} />
          <span aria-hidden="true">{shelf ? text[shelf] : text.none}</span>
          <ChevronIcon />
          {label}
          {select}
        </div>
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      {select}
      {error}
    </div>
  )
}

/** The control for a Book RePrint stores, seeded from the response's `viewerShelf`. */
export function BookShelfSelector({
  book,
  signedIn,
  variant,
}: {
  book: { slug: string; title: string; viewerShelf?: Shelf | null }
  signedIn: boolean
  variant?: ShelfVariant
}) {
  return (
    <ShelfSelector
      target={{ kind: 'book', slug: book.slug }}
      title={book.title}
      shelf={book.viewerShelf}
      signedIn={signedIn}
      variant={variant}
    />
  )
}
