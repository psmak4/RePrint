import { bookSeries, books, type Database, series, sourceLinks } from '@reprint/db'
import { and, eq, exists, isNull, lt, or, sql } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { type Call, direct, importBookFromSource, storedBooks } from './import-book.js'
import { isLocked } from './ingest/fields.js'
import type { SourceAdapter } from './sources/types.js'
import { STALE_AFTER_MS } from './staleness.js'

/** Series imports wait behind interactive work and Admin refreshes (PRD §6). */
export const SERIES_SYNC_PRIORITY = 10

/** One member a sync found missing, for a `catalog.series-member` job. */
export interface SeriesMemberImport {
  seriesId: string
  sourceId: string
  position: number | null
}

export type SeriesSyncOutcome =
  | { outcome: 'synced'; toImport: SeriesMemberImport[] }
  | { outcome: 'not_linked' | 'not_found' | 'unsupported' }

/**
 * Reads a Series' member list from its Source (D-199). It records the Source's count at once, adds
 * the membership of members already stored, and returns the missing members, each to be imported
 * by its own `catalog.series-member` job so one long Series never holds a worker. A list that
 * cannot be read throws, so the job retries; a Series the Source no longer has is recorded as
 * synced, so views stop queuing it.
 */
export async function syncSeries(options: {
  db: Database
  source: SourceAdapter
  seriesId: string
  call?: Call
  now?: Date
}): Promise<SeriesSyncOutcome> {
  const { db, source, seriesId } = options
  const call = options.call ?? direct
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
    .orderBy(sourceLinks.sourceId)
    .limit(1)
  if (!link) return { outcome: 'not_linked' }
  const list = await call(() => getSeriesMembers(link.sourceId))
  if (!list) {
    await db.update(series).set({ membersSyncedAt: now }).where(eq(series.id, seriesId))
    return { outcome: 'not_found' }
  }
  // The count first, so "Book N of M" is right while the members are still being imported.
  await db
    .update(series)
    .set({ sourceMemberCount: list.members.length })
    .where(eq(series.id, seriesId))

  const have = await storedBooks(
    db,
    source.name,
    list.members.map((member) => member.sourceId),
  )
  const toImport: SeriesMemberImport[] = []
  for (const member of list.members) {
    const bookId = have.get(member.sourceId)
    if (bookId) {
      // Stored before it had this Series: record the membership now, without asking the Source.
      await addMembership(db, bookId, seriesId, member.position)
    } else {
      toImport.push({ seriesId, sourceId: member.sourceId, position: member.position })
    }
  }
  await db.update(series).set({ membersSyncedAt: now }).where(eq(series.id, seriesId))
  return { outcome: 'synced', toImport }
}

/**
 * Imports one member a sync found missing (D-199). The Book is stored as a Series import, so it
 * starts no Series syncs of its own (one level only), and added to the Series. A Source failure
 * throws, so the job retries.
 */
export async function importSeriesMember(options: {
  db: Database
  source: SourceAdapter
  seriesId: string
  sourceId: string
  position: number | null
  call?: Call
  now?: Date
}): Promise<'imported' | 'linked' | 'not_found'> {
  const { db, source, seriesId, sourceId, position } = options
  const call = options.call ?? direct
  const stored = (await storedBooks(db, source.name, [sourceId])).get(sourceId)
  if (stored) {
    await addMembership(db, stored, seriesId, position)
    return 'linked'
  }
  const bookId = await importBookFromSource({
    db,
    source,
    sourceId,
    call,
    ...(options.now ? { now: options.now } : {}),
  })
  if (!bookId) return 'not_found'
  await addMembership(db, bookId, seriesId, position)
  return 'imported'
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
    .innerJoin(books, eq(books.id, bookSeries.bookId))
    .where(
      and(
        eq(bookSeries.bookId, bookId),
        // A Book only a Series sync brought in starts no syncs of its own (one level only).
        eq(books.importOnly, false),
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

/** Queues one background import per missing member, each retried on its own (D-199). */
export async function queueSeriesMemberImports(
  jobs: Pick<JobQueue, 'enqueue'>,
  members: readonly SeriesMemberImport[],
): Promise<void> {
  for (const member of members) {
    await jobs.enqueue('catalog.series-member', member, {
      deduplicationId: `catalog.series-member-${member.seriesId}-${member.sourceId}`,
      priority: SERIES_SYNC_PRIORITY,
    })
  }
}
