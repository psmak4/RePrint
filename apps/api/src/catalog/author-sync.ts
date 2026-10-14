import { authors, books, contributions, type Database, sourceLinks } from '@reprint/db'
import { and, eq, sql } from 'drizzle-orm'
import type { JobQueue } from '../jobs/queue.js'
import { type Call, direct, importBookFromSource, storedBooks } from './import-book.js'
import { SERIES_SYNC_PRIORITY } from './series-sync.js'
import type { SourceAdapter } from './sources/types.js'
import { STALE_AFTER_MS } from './staleness.js'

/** Bibliography imports wait behind interactive work, as Series imports do (PRD §6, D-203). */
export const AUTHOR_SYNC_PRIORITY = SERIES_SYNC_PRIORITY

/** One Book a sync found missing, for a `catalog.author-book` job. */
export interface AuthorBookImport {
  authorId: string
  sourceId: string
}

export type AuthorSyncOutcome =
  | { outcome: 'synced'; toImport: AuthorBookImport[] }
  | { outcome: 'not_linked' | 'unsupported' }

/**
 * Reads an Author's Books from the Source (D-203): records how many there are and when, and
 * returns those not stored yet, each for its own `catalog.author-book` job. A list that cannot be
 * read throws, so the job retries; an Author this Source cannot list is recorded as synced, so
 * views stop queuing it.
 */
export async function syncAuthorBooks(options: {
  db: Database
  source: SourceAdapter
  authorId: string
  call?: Call
  now?: Date
}): Promise<AuthorSyncOutcome> {
  const { db, source, authorId } = options
  const call = options.call ?? direct
  const now = options.now ?? new Date()
  const getAuthorBooks = source.getAuthorBooks?.bind(source)
  const [link] = getAuthorBooks
    ? await db
        .select({ sourceId: sourceLinks.sourceId })
        .from(sourceLinks)
        .where(
          and(
            eq(sourceLinks.entityType, 'author'),
            eq(sourceLinks.entityId, authorId),
            eq(sourceLinks.source, source.name),
          ),
        )
        .orderBy(sourceLinks.sourceId)
        .limit(1)
    : []
  if (!getAuthorBooks || !link) {
    await db.update(authors).set({ bibliographySyncedAt: now }).where(eq(authors.id, authorId))
    return { outcome: getAuthorBooks ? 'not_linked' : 'unsupported' }
  }
  const list = await call(() => getAuthorBooks(link.sourceId))
  const have = await storedBooks(
    db,
    source.name,
    list.map((book) => book.sourceId),
  )
  await db
    .update(authors)
    .set({ sourceBookCount: list.length, bibliographySyncedAt: now })
    .where(eq(authors.id, authorId))
  return {
    outcome: 'synced',
    toImport: list
      .filter((book) => !have.has(book.sourceId))
      .map((book) => ({ authorId, sourceId: book.sourceId })),
  }
}

/**
 * Imports one Book a sync found missing (D-203), as an import-only Book, so it starts no syncs of
 * its own. A Source failure throws, so the job retries.
 */
export async function importAuthorBook(options: {
  db: Database
  source: SourceAdapter
  sourceId: string
  call?: Call
  now?: Date
}): Promise<'imported' | 'stored' | 'not_found'> {
  const { db, source, sourceId } = options
  if ((await storedBooks(db, source.name, [sourceId])).has(sourceId)) return 'stored'
  const bookId = await importBookFromSource({
    db,
    source,
    sourceId,
    ...(options.call ? { call: options.call } : {}),
    ...(options.now ? { now: options.now } : {}),
  })
  return bookId ? 'imported' : 'not_found'
}

/**
 * Whether viewing this Author should import their Books (D-203): they have a Source link, were not
 * synced in the last 30 days, and are credited on a Book a Member reached. An Author known only
 * through imported Books is never due, so imports go one level only.
 */
export async function authorDueForSync(
  db: Database,
  author: { id: string; bibliographySyncedAt: Date | null },
  now: Date = new Date(),
): Promise<boolean> {
  const synced = author.bibliographySyncedAt
  if (synced && now.getTime() - synced.getTime() < STALE_AFTER_MS) return false
  const [linked] = await db
    .select({ one: sql`1` })
    .from(sourceLinks)
    .where(and(eq(sourceLinks.entityType, 'author'), eq(sourceLinks.entityId, author.id)))
    .limit(1)
  if (!linked) return false
  const [reached] = await db
    .select({ one: sql`1` })
    .from(contributions)
    .innerJoin(books, eq(books.id, contributions.bookId))
    .where(and(eq(contributions.authorId, author.id), eq(books.importOnly, false)))
    .limit(1)
  return reached !== undefined
}

/** Queues an Author's bibliography sync; one waits or runs per Author at a time. */
export async function queueAuthorSync(
  jobs: Pick<JobQueue, 'enqueue'>,
  authorId: string,
): Promise<void> {
  await jobs.enqueue(
    'catalog.author-sync',
    { authorId },
    { deduplicationId: `catalog.author-sync-${authorId}`, priority: AUTHOR_SYNC_PRIORITY },
  )
}

/**
 * Queues one background import per missing Book, each retried on its own (D-203), in one bulk
 * call: a prolific Author can have hundreds (M10-T11).
 */
export async function queueAuthorBookImports(
  jobs: Pick<JobQueue, 'enqueueMany'>,
  missing: readonly AuthorBookImport[],
): Promise<void> {
  await jobs.enqueueMany(
    'catalog.author-book',
    missing.map((book) => ({
      payload: book,
      options: {
        deduplicationId: `catalog.author-book-${book.authorId}-${book.sourceId}`,
        priority: AUTHOR_SYNC_PRIORITY,
      },
    })),
  )
}
