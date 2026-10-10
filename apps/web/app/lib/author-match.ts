import type { AuthorSuggestion } from '@reprint/shared'

const words = (text: string): string[] =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/**
 * The first Author whose name contains every word of the query ("herbert dune" does not match, but
 * "frank herbert" and "herbert" do), or `null`. A single short word is too loose to call a match.
 */
export function matchAuthor(q: string, authors: AuthorSuggestion[]): AuthorSuggestion | null {
  const wanted = words(q)
  if (wanted.length === 0 || (wanted.length === 1 && (wanted[0]?.length ?? 0) < 4)) return null
  return (
    authors.find((author) => {
      const have = new Set(words(author.name))
      return wanted.every((word) => have.has(word))
    }) ?? null
  )
}
