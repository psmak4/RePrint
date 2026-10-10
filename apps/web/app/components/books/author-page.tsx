import type { AuthorDetail, BookSummary, ContributionRole } from '@reprint/shared'
import { useEffect, useRef, useState } from 'react'
import { copy } from '../../copy/index.js'
import { initialsOf } from '../../lib/avatar.js'
import { coverUrl } from '../../lib/cover-url.js'
import { BookGrid } from './book-tile.js'
import { PageHero } from './page-hero.js'

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
  const dates = lifeDates(author.birthDate, author.deathDate)
  return (
    <article className="flex flex-col gap-10 md:gap-14">
      <PageHero
        eyebrow={
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:text-[13px]">
            {text.eyebrow}
          </p>
        }
        leading={<AuthorPhoto photo={author.photo} name={author.name} />}
        title={author.name}
        lead={
          dates || author.alternateNames.length > 0 ? (
            <>
              {dates ? <span className="block">{dates}</span> : null}
              {author.alternateNames.length > 0 ? (
                <span className="block text-[15px] text-muted-foreground">
                  {text.alsoKnownAs(author.alternateNames.join(', '))}
                </span>
              ) : null}
            </>
          ) : undefined
        }
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-12">
          {groups.length === 0 ? (
            <section aria-labelledby="author-books" className="flex flex-col gap-4">
              <h2 id="author-books" className={SECTION_HEADING}>
                {text.booksHeading}
              </h2>
              <p className="text-muted-foreground">{text.noBooks}</p>
            </section>
          ) : (
            groups.map(({ group, books }) => (
              <section
                key={group}
                aria-labelledby={`author-books-${group}`}
                className="flex flex-col gap-5 md:gap-6"
              >
                <h2 id={`author-books-${group}`} className={SECTION_HEADING}>
                  {text.roleHeadings[group]}
                </h2>
                <BookGrid
                  narrow
                  items={books.map((book) => ({
                    slug: book.slug,
                    book: {
                      title: book.title,
                      subtitle: book.subtitle,
                      cover: book.cover,
                      firstPublishedYear: book.firstPublishedYear,
                      authorNames: book.contributions
                        .filter((c) => groupOf(c.role) === 'author')
                        .map((c) => c.author.name),
                      rating: book.rating,
                    },
                  }))}
                />
              </section>
            ))
          )}
        </div>
        <aside className="min-w-0">
          <Bio bio={author.bio} />
        </aside>
      </div>
    </article>
  )
}

const SECTION_HEADING =
  'font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]'

const PHOTO_FRAME =
  'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#bfdbfe] md:size-28'

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
        <span aria-hidden="true" className="font-serif text-3xl font-medium md:text-[40px]">
          {initialsOf(name)}
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
    <section
      aria-labelledby="author-bio"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-[22px]"
    >
      <h2
        id="author-bio"
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        {text.aboutHeading}
      </h2>
      {body ? (
        <p className="text-[15px] leading-relaxed whitespace-pre-line text-[#334155]">{body}</p>
      ) : (
        <p className="text-[15px] text-muted-foreground">{text.noBio}</p>
      )}
    </section>
  )
}
