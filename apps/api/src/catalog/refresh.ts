import { books, type Database, sourceLinks, sourceRecords } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq, lt } from 'drizzle-orm'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'

/** A stored Book is refreshed when it is older than this (PRD §6). */
export const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** Source records are kept this long for debugging (PRD §5.2). */
export const SOURCE_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function isStale(refreshedAt: Date | null, now: Date = new Date()): boolean {
  return refreshedAt === null || now.getTime() - refreshedAt.getTime() > STALE_AFTER_MS
}

export type RefreshOutcome = 'refreshed' | 'not_linked' | 'not_found' | 'missing_book'

/**
 * Re-fetches a stored Book from its Source and stores it again through `ingestBook`, so locked fields
 * stay untouched (PRD §6). `call` wraps the Source calls, so the worker can run them as background
 * requests behind interactive ones.
 */
export async function refreshBook(options: {
  db: Database
  source: SourceAdapter
  bookId: string
  call?: <T>(fn: () => Promise<T>) => Promise<T>
  now?: Date
}): Promise<RefreshOutcome> {
  const { db, source, bookId } = options
  const call = options.call ?? (<T>(fn: () => Promise<T>) => fn())
  const now = options.now ?? new Date()
  const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId)).limit(1)
  if (!book) return 'missing_book'
  const [link] = await db
    .select({ sourceId: sourceLinks.sourceId })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.entityType, 'book'),
        eq(sourceLinks.entityId, bookId),
        eq(sourceLinks.source, source.name),
      ),
    )
    .limit(1)
  if (!link) return 'not_linked'

  const candidate = await call(() => source.getBook(link.sourceId))
  if (!candidate) {
    // The Source no longer has it; look again after another 30 days rather than on every view.
    await db.update(books).set({ refreshedAt: now }).where(eq(books.id, bookId))
    return 'not_found'
  }
  const authorRecords = new Map<string, AuthorRecord>()
  for (const contribution of candidate.book.contributions) {
    const authorLink = contribution.sourceLink
    if (!authorLink || authorRecords.has(authorLink.sourceId)) continue
    const record = await call(() => source.getAuthor(authorLink.sourceId))
    if (record) authorRecords.set(authorLink.sourceId, record)
  }
  await ingestBook(db, { source, candidate, authorRecords, now })
  return 'refreshed'
}

/** Deletes raw Source responses older than 30 days. Returns how many were removed. */
export async function purgeSourceRecords(db: Database, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SOURCE_RECORD_RETENTION_MS)
  const deleted = await db
    .delete(sourceRecords)
    .where(lt(sourceRecords.fetchedAt, cutoff))
    .returning({ id: sourceRecords.id })
  return deleted.length
}
