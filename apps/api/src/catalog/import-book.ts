import { type Database, sourceLinks } from '@reprint/db'
import type { AuthorRecord } from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { ingestBook } from './ingest/ingest.js'
import type { SourceAdapter } from './sources/types.js'

/** Runs a Source call; jobs pass `catalog.background` so it waits behind interactive requests. */
export type Call = <T>(fn: () => Promise<T>) => Promise<T>
export const direct: Call = (fn) => fn()

/** How many Source IDs one lookup of stored Books checks at a time. */
const LOOKUP_CHUNK = 500

/** The stored Books for these Source IDs, by Source ID. */
export async function storedBooks(
  db: Database,
  source: string,
  sourceIds: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  for (let start = 0; start < sourceIds.length; start += LOOKUP_CHUNK) {
    const rows = await db
      .select({ sourceId: sourceLinks.sourceId, bookId: sourceLinks.entityId })
      .from(sourceLinks)
      .where(
        and(
          eq(sourceLinks.entityType, 'book'),
          eq(sourceLinks.source, source),
          inArray(sourceLinks.sourceId, sourceIds.slice(start, start + LOOKUP_CHUNK)),
        ),
      )
    for (const row of rows) found.set(row.sourceId, row.bookId)
  }
  return found
}

/**
 * Fetches a Book and its Authors from the Source and stores it as an import (D-199, D-203): it is
 * marked import-only, so it starts no syncs of its own until a Member reaches it. Returns the Book's
 * ID, or `null` when the Source no longer has it; a Source failure throws so the job retries.
 */
export async function importBookFromSource(options: {
  db: Database
  source: SourceAdapter
  sourceId: string
  call?: Call
  now?: Date
}): Promise<string | null> {
  const { db, source, sourceId } = options
  const call = options.call ?? direct
  const candidate = await call(() => source.getBook(sourceId))
  if (!candidate) return null
  const authorRecords = new Map<string, AuthorRecord>()
  for (const contribution of candidate.book.contributions) {
    const authorLink = contribution.sourceLink
    if (!authorLink || authorRecords.has(authorLink.sourceId)) continue
    const record = await call(() => source.getAuthor(authorLink.sourceId))
    if (record) authorRecords.set(authorLink.sourceId, record)
  }
  const ingested = await ingestBook(db, {
    source,
    candidate,
    authorRecords,
    importOnly: true,
    ...(options.now ? { now: options.now } : {}),
  })
  return ingested.bookId
}
