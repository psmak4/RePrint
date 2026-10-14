import { type Database, sourceLinks, sourceRatings } from '@reprint/db'
import type { SourceRating } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Stores, replaces, or removes the reader rating a Source gives one of its records of a Book
 * (D-204), against that record's Source link, so another record of the same Book never overwrites
 * it. `null` means the Source has none, so the row goes; `undefined` means it did not say, so
 * nothing changes; a record with no Book link changes nothing either.
 */
export async function saveSourceRating(
  tx: Tx,
  input: {
    source: string
    sourceId: string
    rating: SourceRating | null | undefined
    now: Date
  },
): Promise<'saved' | 'removed' | 'unchanged'> {
  const { source, sourceId, rating, now } = input
  if (rating === undefined) return 'unchanged'
  const [link] = await tx
    .select({ id: sourceLinks.id })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.source, source),
        eq(sourceLinks.entityType, 'book'),
        eq(sourceLinks.sourceId, sourceId),
      ),
    )
    .limit(1)
  if (!link) return 'unchanged'
  if (rating === null) {
    const removed = await tx
      .delete(sourceRatings)
      .where(eq(sourceRatings.sourceLinkId, link.id))
      .returning({ id: sourceRatings.sourceLinkId })
    return removed.length > 0 ? 'removed' : 'unchanged'
  }
  const values = {
    average: Math.round(rating.average * 100) / 100,
    count: rating.count,
    counts: rating.distribution,
    fetchedAt: now,
  }
  await tx
    .insert(sourceRatings)
    .values({ sourceLinkId: link.id, ...values })
    .onConflictDoUpdate({ target: sourceRatings.sourceLinkId, set: values })
  return 'saved'
}
