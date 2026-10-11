import { type Database, series, sourceLinks } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'

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
    .select({ sourceId: sourceLinks.sourceId })
    .from(sourceLinks)
    .where(and(eq(sourceLinks.entityType, 'book'), eq(sourceLinks.source, source.name)))
  const have = new Set(stored.map((row) => row.sourceId))
  let imported = 0
  let failed = 0
  for (const member of list.members) {
    if (have.has(member.sourceId)) continue
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
      await ingestBook(db, { source, candidate, authorRecords, now })
      have.add(member.sourceId)
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

/** Queues a background sync for each Series, at most one per Series per UTC day. */
export async function queueSeriesSyncs(
  jobs: Pick<JobQueue, 'enqueue'>,
  seriesIds: readonly string[],
  now: Date = new Date(),
): Promise<void> {
  const day = now.toISOString().slice(0, 10)
  for (const seriesId of seriesIds) {
    await jobs.enqueue(
      'catalog.series-sync',
      { seriesId },
      { jobId: `catalog.series-sync-${seriesId}-${day}`, priority: SERIES_SYNC_PRIORITY },
    )
  }
}
