import { type Database, sourceLinks } from '@reprint/db'
import type { SourceRating } from '@reprint/shared'
import { and, asc, eq, gt } from 'drizzle-orm'
import { type Call, direct } from './import-book.js'
import { saveSourceRating } from './source-ratings.js'
import type { SourceAdapter } from './sources/types.js'

/**
 * Fills in or refreshes the Source's reader ratings for every stored Book linked to it (D-204), a
 * batch of Books per request. Books the Source did not return are left as they are; a batch the
 * Source fails on is logged and skipped, so the run can be repeated.
 */
export async function backfillSourceRatings(options: {
  db: Database
  source: SourceAdapter
  call?: Call
  batchSize?: number
  now?: Date
  log?: (message: string, detail: Record<string, unknown>) => void
}): Promise<{ saved: number; removed: number; failedBatches: number }> {
  const { db, source } = options
  const call = options.call ?? direct
  const batchSize = options.batchSize ?? 100
  const now = options.now ?? new Date()
  const totals = { saved: 0, removed: 0, failedBatches: 0 }
  const getBookRatings = source.getBookRatings?.bind(source)
  if (!getBookRatings) return totals
  for (let after = ''; ; ) {
    const links = await db
      .select({ id: sourceLinks.id, sourceId: sourceLinks.sourceId })
      .from(sourceLinks)
      .where(
        and(
          eq(sourceLinks.entityType, 'book'),
          eq(sourceLinks.source, source.name),
          after ? gt(sourceLinks.id, after) : undefined,
        ),
      )
      .orderBy(asc(sourceLinks.id))
      .limit(batchSize)
    const last = links.at(-1)
    if (!last) break
    after = last.id
    let ratings: Map<string, SourceRating | null>
    try {
      ratings = await call(() => getBookRatings(links.map((link) => link.sourceId)))
    } catch (error) {
      totals.failedBatches += 1
      options.log?.('could not read ratings for a batch of Books', {
        err: error,
        first: links[0]?.sourceId,
      })
      continue
    }
    await db.transaction(async (tx) => {
      for (const link of links) {
        if (!ratings.has(link.sourceId)) continue
        const result = await saveSourceRating(tx, {
          source: source.name,
          sourceId: link.sourceId,
          rating: ratings.get(link.sourceId) ?? null,
          now,
        })
        if (result === 'saved') totals.saved += 1
        if (result === 'removed') totals.removed += 1
      }
    })
    if (links.length < batchSize) break
  }
  return totals
}
