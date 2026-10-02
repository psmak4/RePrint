import type { LibrarySort, Shelf } from '@reprint/shared'

export type LibraryView = { shelf?: Shelf | undefined; sort: LibrarySort; page: number }

/** A Library page URL for one view. Defaults are left out so URLs stay short. */
export function libraryHref(
  username: string,
  view: LibraryView,
  change: Partial<LibraryView> = {},
): string {
  const next = { ...view, ...change }
  const params = new URLSearchParams()
  if (next.shelf) params.set('shelf', next.shelf)
  if (next.sort !== 'added_desc') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  const search = params.toString()
  return `/u/${username}/library${search ? `?${search}` : ''}`
}
