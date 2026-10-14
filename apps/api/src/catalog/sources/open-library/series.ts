import type { SourceLink } from '@reprint/shared'
import { SOURCE_NAME } from './source-name.js'

/** How many Series members one search page holds. */
export const SERIES_PAGE_SIZE = 100

const SERIES_ID = /^OL\d+L$/

/** A Series position as a number: whole or decimal (2.5); anything else ("1-3", "Book 2") is `null`. */
export function toPosition(text: string | undefined): number | null {
  const trimmed = text?.trim() ?? ''
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
  return Number(trimmed)
}

/** The Series records a search result names, from its parallel `series_*` arrays (D-199). */
export function seriesOfDoc(doc: {
  series_key?: string[]
  series_name?: string[]
  series_position?: string[]
}): { name: string; position: number | null; sourceLink: SourceLink }[] {
  return (doc.series_key ?? []).flatMap((key, index) => {
    const name = doc.series_name?.[index]?.trim()
    if (!SERIES_ID.test(key) || !name) return []
    return [
      {
        name,
        position: toPosition(doc.series_position?.[index]),
        sourceLink: { source: SOURCE_NAME, entityType: 'series' as const, sourceId: key },
      },
    ]
  })
}

/**
 * The search for a Series' members, `SERIES_PAGE_SIZE` a page; `page` starts at 1. It asks only for the
 * fields the adapter reads from a member.
 */
export function seriesMembersPath(seriesId: string, page: number): string {
  const params = new URLSearchParams({
    q: `series_key:${seriesId}`,
    fields: 'key,title,series_key,series_name,series_position',
    limit: String(SERIES_PAGE_SIZE),
  })
  if (page > 1) params.set('page', String(page))
  return `/search.json?${params.toString()}`
}
