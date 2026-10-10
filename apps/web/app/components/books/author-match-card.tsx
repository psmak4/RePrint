import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { InitialsAvatar } from './avatar.js'

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
  const meta = [life, bookCount !== undefined ? text.bookCount(bookCount) : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <Link
      to={href}
      className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 rounded-[18px] border border-border bg-surface p-5 text-foreground hover:border-input-border md:grid-cols-[88px_minmax(0,1fr)_auto] md:gap-6 md:p-6"
    >
      <InitialsAvatar
        name={name}
        size="xl"
        className="size-16 text-2xl md:size-[88px] md:text-[32px]"
      />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {text.match}
        </span>
        <span className="font-serif text-2xl leading-tight font-medium md:text-[28px]">{name}</span>
        {meta ? <span className="text-[15px] text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="col-span-2 inline-flex h-11 items-center justify-center rounded-full border border-input-border bg-surface px-5 text-[15px] font-semibold md:col-span-1">
        {copy.search.viewAuthor}
      </span>
    </Link>
  )
}
