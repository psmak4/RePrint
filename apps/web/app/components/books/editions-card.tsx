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
}

const SHOWN = 5

/** Editions of a Book with a format filter. Shows five and links to the full list. */
export function EditionsCard({
  editions,
  seeAllHref,
}: {
  editions: EditionsCardItem[]
  seeAllHref?: string
}) {
  const [format, setFormat] = useState<EditionsCardItem['format'] | null>(null)
  const formats = [...new Set(editions.map((e) => e.format))]
  const filtered = format ? editions.filter((e) => e.format === format) : editions
  return (
    <section
      aria-labelledby="editions-card-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 id="editions-card-heading" className="font-serif text-xl font-medium">
        {text.heading(editions.length)}
      </h3>
      {formats.length > 1 ? (
        <fieldset className="mt-3 flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">{text.filterLabel}</legend>
          {[null, ...formats].map((f) => (
            <button
              key={f ?? 'all'}
              type="button"
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={`min-h-6 rounded-full border px-3 py-1 text-sm ${format === f ? 'border-accent bg-accent text-accent-foreground' : 'border-input-border bg-surface hover:bg-surface-raised'}`}
            >
              {f ? copy.books.page.formats[f] : text.allFormats}
            </button>
          ))}
        </fieldset>
      ) : null}
      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{text.empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {filtered.slice(0, SHOWN).map((edition) => (
            <li key={edition.id} className="text-sm">
              <p className="font-medium">{copy.books.page.formats[edition.format]}</p>
              <p className="text-muted-foreground">
                {[
                  edition.publisher,
                  edition.publishedYear ? text.published(edition.publishedYear) : null,
                  edition.isbn13 ? copy.books.page.isbn(edition.isbn13) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {seeAllHref && filtered.length > SHOWN ? (
        <p className="mt-3 text-sm">
          <Link to={seeAllHref} className="text-link underline">
            {text.seeAll}
          </Link>
        </p>
      ) : null}
    </section>
  )
}
