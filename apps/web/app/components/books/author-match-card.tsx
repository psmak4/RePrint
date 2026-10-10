import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

/** The Author a search query matched, shown above the results with a link to their page. */
export function AuthorMatchCard({
  name,
  href,
  born = null,
  died = null,
  bookCount,
}: {
  name: string
  href: string
  born?: string | null
  died?: string | null
  bookCount?: number
}) {
  const text = copy.redesign.author
  const life = text.lifeSpan(born, died)
  return (
    <Link
      to={href}
      className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 hover:bg-surface-raised"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-raised font-serif text-xl"
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {text.match}
        </span>
        <span className="font-serif text-xl font-medium">{name}</span>
        <span className="text-sm text-muted-foreground">
          {[life, bookCount !== undefined ? text.bookCount(bookCount) : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </Link>
  )
}
