import type { AuthorDetail, BookSummary, ContributionRole } from '@reprint/shared'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { coverUrl } from '../../lib/cover-url.js'
import { BookCard } from './book-card.js'

const { author: text } = copy

/** The headings on an Author page, in display order. A co-author reads as written. */
const GROUPS = ['author', 'translator', 'illustrator', 'editor', 'narrator', 'other'] as const
type WorkGroup = (typeof GROUPS)[number]

export type AuthorWorkGroup = { group: WorkGroup; books: BookSummary[] }

function groupOf(role: ContributionRole): WorkGroup {
  return role === 'co_author' ? 'author' : role
}

/**
 * Merges the API's per-Role lists into the page's groups. Books keep the API's order (most
 * reviewed first); merging a co-author list into the written list re-sorts by review count.
 */
export function groupWorks(works: AuthorDetail['works']): AuthorWorkGroup[] {
  return GROUPS.flatMap((group) => {
    const seen = new Set<string>()
    const books = works
      .filter((work) => groupOf(work.role) === group)
      .flatMap((work) => work.books)
      .filter((book) => !seen.has(book.id) && seen.add(book.id))
      .map((book, index) => ({ book, index }))
      .sort((a, b) => b.book.rating.count - a.book.rating.count || a.index - b.index)
      .map(({ book }) => book)
    return books.length > 0 ? [{ group, books }] : []
  })
}

/** The life dates line: "1920 to 1992", "Born 1920", "Died 1992", or nothing. */
export function lifeDates(birthDate: string | null, deathDate: string | null): string | null {
  const birth = birthDate?.slice(0, 4)
  const death = deathDate?.slice(0, 4)
  if (birth && death) return text.lifeSpan(birth, death)
  if (birth) return text.born(birth)
  if (death) return text.died(death)
  return null
}

export function AuthorPage({ author }: { author: AuthorDetail }) {
  const groups = groupWorks(author.works)
  return (
    <article className="flex flex-col gap-8">
      <AuthorHeader author={author} />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          {groups.length === 0 ? (
            <section aria-labelledby="author-books">
              <h2 id="author-books" className="text-xl font-semibold">
                {text.booksHeading}
              </h2>
              <p className="mt-2 text-muted-foreground">{text.noBooks}</p>
            </section>
          ) : (
            groups.map(({ group, books }) => (
              <section key={group} aria-labelledby={`author-books-${group}`}>
                <h2 id={`author-books-${group}`} className="text-xl font-semibold">
                  {text.roleHeadings[group]}
                </h2>
                <ul className="mt-3 flex flex-col gap-4">
                  {books.map((book) => (
                    <li key={book.id}>
                      <BookCard
                        href={`/books/${book.slug}`}
                        book={{
                          title: book.title,
                          subtitle: book.subtitle,
                          cover: book.cover,
                          firstPublishedYear: book.firstPublishedYear,
                          authorNames: book.contributions
                            .filter((c) => groupOf(c.role) === 'author')
                            .map((c) => c.author.name),
                          rating: book.rating,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <aside className="lg:col-span-4">
          <Bio bio={author.bio} />
        </aside>
      </div>
    </article>
  )
}

function AuthorHeader({ author }: { author: AuthorDetail }) {
  const dates = lifeDates(author.birthDate, author.deathDate)
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <AuthorPhoto photo={author.photo} name={author.name} />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-3xl font-semibold break-words">{author.name}</h1>
        {dates ? <p className="text-muted-foreground">{dates}</p> : null}
        {author.alternateNames.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {text.alsoKnownAs(author.alternateNames.join(', '))}
          </p>
        ) : null}
      </div>
    </header>
  )
}

const PHOTO_FRAME =
  'flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised md:size-36'

/** The Author's photo, or their initial when there is none or it fails to load. */
function AuthorPhoto({ photo, name }: { photo: AuthorDetail['photo']; name: string }) {
  const url = coverUrl(photo, 'large')
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // An image that failed before hydration never fires `onError` in React, so check it once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (!url || failed) {
    return (
      <div role="img" aria-label={text.photoAlt(name)} className={PHOTO_FRAME}>
        <span aria-hidden="true" className="text-4xl font-semibold text-muted-foreground">
          {Array.from(name)[0]?.toUpperCase()}
        </span>
      </div>
    )
  }
  return (
    <div className={PHOTO_FRAME}>
      <img
        ref={imgRef}
        src={url}
        alt={text.photoAlt(name)}
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function Bio({ bio }: { bio: string | null }) {
  const body = bio?.trim()
  return (
    <section aria-labelledby="author-bio">
      <h2 id="author-bio" className="text-lg font-semibold">
        {text.aboutHeading}
      </h2>
      {body ? (
        <p className="mt-2 whitespace-pre-line">{body}</p>
      ) : (
        <p className="mt-2 text-muted-foreground">{text.noBio}</p>
      )}
    </section>
  )
}
