import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.redesign.author

function Photo({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={56}
        height={56}
        loading="lazy"
        className="h-14 w-14 rounded-full object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised font-serif text-2xl"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** A compact Author panel: photo (or initial), life dates, a two-line bio, and a link to the page. */
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
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 id="author-card-heading" className="sr-only">
        {text.heading}
      </h3>
      <div className="flex items-center gap-3">
        <Photo name={name} photoUrl={photoUrl} />
        <div className="min-w-0">
          <p className="font-serif text-xl font-medium">{name}</p>
          {life ? <p className="text-sm text-muted-foreground">{life}</p> : null}
        </div>
      </div>
      {bio ? <p className="mt-3 line-clamp-2 text-sm">{bio}</p> : null}
      {bookCount !== undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">{text.bookCount(bookCount)}</p>
      ) : null}
      <p className="mt-3 text-sm">
        <Link to={href} className="text-link underline">
          {text.viewAuthor(name)}
        </Link>
      </p>
    </section>
  )
}
