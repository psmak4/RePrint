import { bookSeries, books, type Database, series } from '@reprint/db'
import type { SeriesEntry } from '@reprint/shared'
import { asc, eq, sql } from 'drizzle-orm'
import { loadBookSummaries } from './read.js'

type SeriesRow = typeof series.$inferSelect

export async function findSeriesBySlug(db: Database, slug: string): Promise<SeriesRow | null> {
  const [row] = await db.select().from(series).where(eq(series.slug, slug)).limit(1)
  return row ?? null
}

/** Every Book in the Series in reading order: by position, empty positions last, then by title. */
export async function loadSeriesEntries(db: Database, row: SeriesRow): Promise<SeriesEntry[]> {
  const members = await db
    .select({ bookId: bookSeries.bookId, position: bookSeries.position })
    .from(bookSeries)
    .innerJoin(books, eq(books.id, bookSeries.bookId))
    .where(eq(bookSeries.seriesId, row.id))
    .orderBy(sql`${bookSeries.position} asc nulls last`, asc(books.title), asc(bookSeries.bookId))
  const summaries = await loadBookSummaries(
    db,
    members.map((member) => member.bookId),
  )
  const byId = new Map(summaries.map((book) => [book.id, book]))
  return members.flatMap((member) => {
    const book = byId.get(member.bookId)
    return book ? [{ position: member.position, book }] : []
  })
}
