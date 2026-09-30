import { books, type Database, sourceLinks } from '@reprint/db'
import type { AuthorRecord, BookCandidate } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'
import { ingestBook } from './ingest/ingest.js'
import { type SourceAdapter, SourceError } from './sources/types.js'

/** Runs a Source call as an interactive request that may take at most `timeoutMs`. */
export type InteractiveCall = <T>(fn: () => Promise<T>, timeoutMs: number) => Promise<T>

export type ResolveResult = { slug: string } | { notFound: true }

/**
 * Stores the Book behind a search candidate and returns its slug (PRD §6). The whole fetch has
 * `timeoutMs` to finish; a Source that fails or is too slow throws `SourceError`. A Book that is already
 * stored is returned without asking the Source, so opening it works even while the Source is down.
 */
export async function resolveCandidate(options: {
  db: Database
  source: SourceAdapter
  candidate: BookCandidate
  timeoutMs: number
  call?: InteractiveCall
}): Promise<ResolveResult> {
  const { db, source, candidate, timeoutMs } = options
  const call = options.call ?? (<T>(fn: () => Promise<T>) => fn())
  const link = candidate.sourceLink

  const [stored] = await db
    .select({ slug: books.slug })
    .from(sourceLinks)
    .innerJoin(books, eq(books.id, sourceLinks.entityId))
    .where(
      and(
        eq(sourceLinks.entityType, 'book'),
        eq(sourceLinks.source, link.source),
        eq(sourceLinks.sourceId, link.sourceId),
      ),
    )
    .limit(1)
  if (stored) return { slug: stored.slug }
  if (link.source !== source.name) return { notFound: true }

  const deadline = Date.now() + timeoutMs
  const remaining = () => {
    const left = deadline - Date.now()
    if (left <= 0) throw new SourceError('The Source did not answer in time')
    return left
  }
  // The gateway bounds each request, but a stalled adapter must not hold the caller past the deadline.
  const bounded = <T>(fn: () => Promise<T>): Promise<T> => {
    const left = remaining()
    let timer: NodeJS.Timeout | undefined
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SourceError('The Source did not answer in time')), left)
    })
    return Promise.race([call(fn, left), expired]).finally(() => clearTimeout(timer))
  }

  const full = await bounded(() => source.getBook(link.sourceId))
  if (!full) return { notFound: true }
  const authorIds = new Set<string>()
  for (const contribution of full.book.contributions) {
    if (contribution.sourceLink) authorIds.add(contribution.sourceLink.sourceId)
  }
  const authorRecords = new Map<string, AuthorRecord>()
  await Promise.all(
    [...authorIds].map(async (sourceId) => {
      const record = await bounded(() => source.getAuthor(sourceId))
      if (record) authorRecords.set(sourceId, record)
    }),
  )
  const ingested = await ingestBook(db, { source, candidate: full, authorRecords })
  return { slug: ingested.slug }
}
