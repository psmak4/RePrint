import { bookSeries, books, type Database, series } from '@reprint/db'
import { SERIES_WINDOW, type SeriesEntry } from '@reprint/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { loadBookSummaries } from './read.js'

type SeriesRow = typeof series.$inferSelect

/** How long after a sync the Series page says Books are still being added (D-199). */
const ADDING_FOR_MS = 24 * 60 * 60 * 1000

export async function findSeriesBySlug(db: Database, slug: string): Promise<SeriesRow | null> {
  const [row] = await db.select().from(series).where(eq(series.slug, slug)).limit(1)
  return row ?? null
}

/**
 * The Series' Books in reading order (by position, empty positions last, then by title), and how
 * many are stored. With `around` (a Book slug), only the `SERIES_WINDOW` Books around that Book,
 * so a Book page loads a few summaries however long the Series is (D-199).
 */
export async function loadSeriesEntries(
  db: Database,
  row: SeriesRow,
  around?: string,
): Promise<{ items: SeriesEntry[]; total: number }> {
  const members = await db
    .select({ bookId: bookSeries.bookId, position: bookSeries.position, slug: books.slug })
    .from(bookSeries)
    .innerJoin(books, eq(books.id, bookSeries.bookId))
    .where(eq(bookSeries.seriesId, row.id))
    .orderBy(sql`${bookSeries.position} asc nulls last`, asc(books.title), asc(bookSeries.bookId))
  let shown = members
  if (around !== undefined && members.length > SERIES_WINDOW) {
    const index = members.findIndex((member) => member.slug === around)
    // The current Book just before the middle, never past either end.
    const start = Math.max(
      0,
      Math.min(index - SERIES_WINDOW / 2 + 1, members.length - SERIES_WINDOW),
    )
    shown = members.slice(start, start + SERIES_WINDOW)
  }
  const summaries = await loadBookSummaries(
    db,
    shown.map((member) => member.bookId),
  )
  const byId = new Map(summaries.map((book) => [book.id, book]))
  const items = shown.flatMap((member) => {
    const book = byId.get(member.bookId)
    return book ? [{ position: member.position, book }] : []
  })
  return { items, total: members.length }
}

/** True while a recent sync is still importing members the Source lists (D-199). */
export function isAdding(row: SeriesRow, stored: number, now: Date = new Date()): boolean {
  if (row.sourceMemberCount === null || row.membersSyncedAt === null) return false
  if (stored >= row.sourceMemberCount) return false
  return now.getTime() - row.membersSyncedAt.getTime() < ADDING_FOR_MS
}
