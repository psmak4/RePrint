import type { BookSummary, SearchSuggestResponse } from '@reprint/shared'
import { copy } from '../copy/index.js'

export type Suggest = (q: string, signal: AbortSignal) => Promise<SearchSuggestResponse>

/**
 * The header box's suggestions. The response schema (and Zod with it) is loaded beside the first
 * request, not with every page, since the box is in every page's root bundle (M10-T07).
 */
export async function fetchSuggestions(
  q: string,
  signal: AbortSignal,
): Promise<SearchSuggestResponse> {
  const schemas = import('./search-suggest-schema.js')
  // A failed load still throws where it is awaited; this only keeps an early return from leaving
  // the import unhandled.
  schemas.catch(() => {})
  const response = await fetch(`/search/suggest?q=${encodeURIComponent(q)}`, { signal })
  if (!response.ok) throw new Error(`suggestions failed with ${response.status}`)
  const { searchSuggestResponseSchema } = await schemas
  return searchSuggestResponseSchema.parse(await response.json())
}

export type Option = {
  key: string
  href: string
  label: string
  detail: string
  kind: string
  /** Set on a Book suggestion: choosing it reaches the Book (D-200). */
  bookSlug?: string
}

export function toOptions({ books, authors }: SearchSuggestResponse): Option[] {
  const c = copy.shell.search
  const bookOptions = books.map((book: BookSummary) => ({
    key: `book-${book.id}`,
    href: `/books/${book.slug}`,
    label: book.title,
    detail: book.contributions
      .filter((contribution) => contribution.role === 'author')
      .map((contribution) => contribution.author.name)
      .join(', '),
    kind: c.bookKind,
    bookSlug: book.slug,
  }))
  const authorOptions = authors.map((author) => ({
    key: `author-${author.id}`,
    href: `/authors/${author.slug}`,
    label: author.name,
    detail: '',
    kind: c.authorKind,
  }))
  return [...bookOptions, ...authorOptions]
}
