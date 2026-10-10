import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { InitialsAvatar } from './avatar.js'

const text = copy.redesign.author

function Photo({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={64}
        height={64}
        loading="lazy"
        className="size-16 shrink-0 rounded-full object-cover"
      />
    )
  }
  return <InitialsAvatar name={name} size="lg" />
}

/** A compact Author panel: photo (or initials), life dates, a two-line bio, and a link to the page. */
export function AuthorCard({
  name,
  href,
  photoUrl = null,
  born = null,
  died = null,
  bio = null,
  bookCount,
}: {
  name: string
  href: string
  photoUrl?: string | null
  born?: string | null
  died?: string | null
  bio?: string | null
  bookCount?: number
}) {
  const life = text.lifeSpan(born, died)
  return (
    <section
      aria-labelledby="author-card-heading"
      className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-[22px]"
    >
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {text.heading}
      </p>
      <div className="flex items-center gap-3.5">
        <Photo name={name} photoUrl={photoUrl} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="author-card-heading" className="font-serif text-[22px] leading-tight font-medium">
            {name}
          </h2>
          {life ? <p className="text-sm text-muted-foreground">{life}</p> : null}
        </div>
      </div>
      {bio ? (
        <p className="line-clamp-3 text-[15px] leading-relaxed text-[#334155]">{bio}</p>
      ) : null}
      {bookCount !== undefined ? (
        <p className="text-sm text-muted-foreground">{text.bookCount(bookCount)}</p>
      ) : null}
      <Link to={href} className="text-[15px] font-semibold text-link hover:underline">
        {text.viewAuthor(name)}
      </Link>
    </section>
  )
}
