/** How many works one search page of an Author's works holds. */
export const AUTHOR_WORKS_PAGE_SIZE = 100

/** The search for an Author's works, most Editions first; `page` starts at 1 (D-203). */
export function authorWorksPath(authorId: string, page: number): string {
  const params = new URLSearchParams({
    q: `author_key:${authorId}`,
    fields: 'key,title,author_key,edition_count',
    sort: 'editions',
    limit: String(AUTHOR_WORKS_PAGE_SIZE),
  })
  if (page > 1) params.set('page', String(page))
  return `/search.json?${params.toString()}`
}
