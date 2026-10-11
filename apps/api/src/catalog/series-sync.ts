import { bookSeries, books, type Database, series, sourceLinks } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq, exists, isNull, lt, or, sql } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { isLocked } from './ingest/fields.js'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'
import { STALE_AFTER_MS } from './staleness.js'

/** Series imports wait behind interactive work and Admin refreshes (PRD §6). */
export const SERIES_SYNC_PRIORITY = 10

export type SeriesSyncOutcome =
  | { outcome: 'synced'; imported: number; failed: number }
  | { outcome: 'not_linked' | 'not_found' | 'unsupported' }

/**
 * Imports every member of a Series that is not stored yet (D-199). Members are stored through
 * `ingestBook` like any Book, but their own Series are not synced: this function has no job queue
 * and ignores each member's `seriesToSync` (one level only). A member that fails is skipped; the
 * next sync tries it again.
 */
export async function syncSeries(options: {
  db: Database
  source: SourceAdapter
  seriesId: string
  call?: <T>(fn: () => Promise<T>) => Promise<T>
  now?: Date
  onMemberError?: (sourceId: string, error: unknown) => void
}): Promise<SeriesSyncOutcome> {
  const { db, source, seriesId } = options
  const call = options.call ?? (<T>(fn: () => Promise<T>) => fn())
  const now = options.now ?? new Date()
  const getSeriesMembers = source.getSeriesMembers?.bind(source)
  if (!getSeriesMembers) return { outcome: 'unsupported' }
  const [link] = await db
    .select({ sourceId: sourceLinks.sourceId })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.entityType, 'series'),
        eq(sourceLinks.entityId, seriesId),
        eq(sourceLinks.source, source.name),
      ),
    )
    .limit(1)
  if (!link) return { outcome: 'not_linked' }
  const list = await call(() => getSeriesMembers(link.sourceId))
  if (!list) return { outcome: 'not_found' }

  const stored = await db
    .select({ sourceId: sourceLinks.sourceId, bookId: sourceLinks.entityId })
    .from(sourceLinks)
    .where(and(eq(sourceLinks.entityType, 'book'), eq(sourceLinks.source, source.name)))
  const have = new Map(stored.map((row) => [row.sourceId, row.bookId]))
  let imported = 0
  let failed = 0
  for (const member of list.members) {
    const bookId = have.get(member.sourceId)
    if (bookId) {
      // Stored before it had this Series: record the membership now, without asking the Source,
      // unless an admin locked the Book's Series.
      await addMembership(db, bookId, seriesId, member.position)
      continue
    }
    try {
      const candidate = await call(() => source.getBook(member.sourceId))
      if (!candidate) continue
      const authorRecords = new Map<string, AuthorRecord>()
      for (const contribution of candidate.book.contributions) {
        const authorLink = contribution.sourceLink
        if (!authorLink || authorRecords.has(authorLink.sourceId)) continue
        const record = await call(() => source.getAuthor(authorLink.sourceId))
        if (record) authorRecords.set(authorLink.sourceId, record)
      }
      const ingested = await ingestBook(db, { source, candidate, authorRecords, now })
      have.set(member.sourceId, ingested.bookId)
      imported += 1
    } catch (error) {
      failed += 1
      options.onMemberError?.(member.sourceId, error)
    }
  }
  await db
    .update(series)
    .set({ sourceMemberCount: list.members.length, membersSyncedAt: now })
    .where(eq(series.id, seriesId))
  return { outcome: 'synced', imported, failed }
}

/** Adds a Book to a Series at `position` unless it is there already or its Series are locked. */
async function addMembership(
  db: Database,
  bookId: string,
  seriesId: string,
  position: number | null,
): Promise<void> {
  const [book] = await db
    .select({ lockedFields: books.lockedFields })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1)
  if (!book || isLocked('series', book.lockedFields, {})) return
  await db.insert(bookSeries).values({ bookId, seriesId, position }).onConflictDoNothing()
}

/**
 * The Book's Series that have a Source record and whose members were never synced or not in the
 * last 30 days, so viewing a stored Book fills in its Series without waiting for a refresh (D-199).
 */
export async function seriesDueForBook(
  db: Database,
  bookId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const syncedBefore = new Date(now.getTime() - STALE_AFTER_MS)
  const rows = await db
    .select({ id: series.id })
    .from(bookSeries)
    .innerJoin(series, eq(series.id, bookSeries.seriesId))
    .where(
      and(
        eq(bookSeries.bookId, bookId),
        or(isNull(series.membersSyncedAt), lt(series.membersSyncedAt, syncedBefore)),
        exists(
          db
            .select({ one: sql`1` })
            .from(sourceLinks)
            .where(and(eq(sourceLinks.entityType, 'series'), eq(sourceLinks.entityId, series.id))),
        ),
      ),
    )
  return rows.map((row) => row.id)
}

/**
 * Queues a background sync for each Series. A Series already waiting or syncing is not queued
 * twice; once a sync has run, `members_synced_at` keeps it from being due again for 30 days.
 */
export async function queueSeriesSyncs(
  jobs: Pick<JobQueue, 'enqueue'>,
  seriesIds: readonly string[],
): Promise<void> {
  for (const seriesId of seriesIds) {
    await jobs.enqueue(
      'catalog.series-sync',
      { seriesId },
      { deduplicationId: `catalog.series-sync-${seriesId}`, priority: SERIES_SYNC_PRIORITY },
    )
  }
}
