import {
  type BookSummary,
  type SearchSuggestResponse,
  searchSuggestResponseSchema,
} from '@reprint/shared'
import { copy } from '../copy/index.js'

export type Suggest = (q: string, signal: AbortSignal) => Promise<SearchSuggestResponse>

export async function fetchSuggestions(
  q: string,
  signal: AbortSignal,
): Promise<SearchSuggestResponse> {
  const response = await fetch(`/search/suggest?q=${encodeURIComponent(q)}`, { signal })
  if (!response.ok) throw new Error(`suggestions failed with ${response.status}`)
  return searchSuggestResponseSchema.parse(await response.json())
}

export type Option = { key: string; href: string; label: string; detail: string; kind: string }

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
