import { cn } from '@reprint/ui'
import { useState } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'

const text = copy.redesign.editions

export type EditionsCardItem = {
  id: string
  format: keyof typeof copy.books.page.formats
  publisher: string | null
  publishedYear: number | null
  isbn13: string | null
  /** The Primary Edition gets a tag. */
  primary?: boolean
}

const SHOWN = 5

function FormatIcon({ format }: { format: EditionsCardItem['format'] }) {
  const path =
    format === 'audiobook' ? (
      <>
        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
        <path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z" />
      </>
    ) : format === 'ebook' ? (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </>
    ) : (
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    )
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-[#334155]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {path}
      </svg>
    </span>
  )
}

/** Editions of a Book with a format filter. Shows five and links to the full list. */
export function EditionsCard({
  editions,
  known = editions.length,
  seeAllHref,
}: {
  editions: EditionsCardItem[]
  /** How many Editions are known in all; the Source may know of more than RePrint lists (D-191). */
  known?: number
  seeAllHref?: string
}) {
  const [format, setFormat] = useState<EditionsCardItem['format'] | null>(null)
  const formats = [...new Set(editions.map((e) => e.format))]
  const filtered = format ? editions.filter((e) => e.format === format) : editions
  const countOf = (f: EditionsCardItem['format']) => editions.filter((e) => e.format === f).length
  return (
    <section
      aria-labelledby="editions-card-heading"
      className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-[22px]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="editions-card-heading" className="font-serif text-[22px] font-medium">
          {copy.redesign.bookPage.editionsHeading}
        </h2>
        <span className="text-sm text-muted-foreground">
          {copy.redesign.bookPage.editionsKnown(known)}
        </span>
      </div>
      {known > editions.length ? (
        <p className="-mt-1.5 text-sm text-muted-foreground">
          {copy.redesign.bookPage.editionsListed(editions.length)}
        </p>
      ) : null}
      {formats.length > 1 ? (
        <fieldset className="flex flex-wrap gap-1.5 border-0 p-0">
          <legend className="sr-only">{text.filterLabel}</legend>
          {[null, ...formats].map((f) => (
            <button
              key={f ?? 'all'}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
                format === f
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-[#d9d4ca] bg-surface text-[#1e293b] hover:border-input-border',
              )}
            >
              {f ? copy.books.page.formats[f] : text.allFormats}
              {f ? (
                <span aria-hidden="true" className="opacity-80">
                  {countOf(f)}
                </span>
              ) : null}
            </button>
          ))}
        </fieldset>
      ) : null}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{text.empty}</p>
      ) : (
        <ul>
          {filtered.slice(0, SHOWN).map((edition) => (
            <li
              key={edition.id}
              className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b border-border py-3.5"
            >
              <FormatIcon format={edition.format} />
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <p className="text-[15px] font-semibold">
                  {[copy.books.page.formats[edition.format], edition.publishedYear]
                    .filter(Boolean)
                    .join(' · ')}
                  {edition.primary ? (
                    <span className="ml-2 inline-flex h-[22px] items-center rounded-full bg-[#ece8e0] px-2 align-middle text-xs font-medium text-[#334155]">
                      {text.primary}
                    </span>
                  ) : null}
                </p>
                {edition.publisher ? (
                  <p className="text-muted-foreground">{edition.publisher}</p>
                ) : null}
                {edition.isbn13 ? (
                  <p className="text-muted-foreground tabular-nums">
                    {copy.books.page.isbn(edition.isbn13)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {seeAllHref && filtered.length > SHOWN ? (
        <Link to={seeAllHref} className="text-[15px] font-semibold text-link hover:underline">
          {text.seeAll}
        </Link>
      ) : null}
    </section>
  )
}
