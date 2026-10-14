import { type Database, sourceRatings } from '@reprint/db'
import type { SourceRating } from '@reprint/shared'
import { and, eq } from 'drizzle-orm'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Stores, replaces, or removes a Source's reader rating for a Book (D-204): `null` means the Source
 * has none, so the row goes; `undefined` means it did not say, so nothing changes.
 */
export async function saveSourceRating(
  tx: Tx,
  input: { bookId: string; source: string; rating: SourceRating | null | undefined; now: Date },
): Promise<'saved' | 'removed' | 'unchanged'> {
  const { bookId, source, rating, now } = input
  if (rating === undefined) return 'unchanged'
  if (rating === null) {
    const removed = await tx
      .delete(sourceRatings)
      .where(and(eq(sourceRatings.bookId, bookId), eq(sourceRatings.source, source)))
      .returning({ bookId: sourceRatings.bookId })
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
    .values({ bookId, source, ...values })
    .onConflictDoUpdate({ target: [sourceRatings.bookId, sourceRatings.source], set: values })
  return 'saved'
}
