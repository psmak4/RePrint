import type { SourceRating } from '@reprint/shared'
import { z } from 'zod'

const RATING_FIELDS = [
  'ratings_average',
  'ratings_count',
  'ratings_count_1',
  'ratings_count_2',
  'ratings_count_3',
  'ratings_count_4',
  'ratings_count_5',
]

/**
 * The fields the byline search asks for: what the adapter reads from it, plus the ratings, which
 * Open Library leaves out by default (D-204).
 */
export const BYLINE_FIELDS = [
  'key',
  'title',
  'subtitle',
  'author_key',
  'author_name',
  'cover_i',
  'cover_width',
  'cover_height',
  'cover_edition_key',
  'first_publish_year',
  'language',
  'series_key',
  'series_name',
  'series_position',
  ...RATING_FIELDS,
].join(',')

/** How many Books one ratings search asks for. */
export const RATINGS_BATCH_SIZE = 100

/** One search for the ratings of up to `RATINGS_BATCH_SIZE` works (D-204). */
export function ratingsSearchPath(workIds: string[]): string {
  const params = new URLSearchParams({
    q: `key:(${workIds.map((id) => `/works/${id}`).join(' OR ')})`,
    fields: ['key', ...RATING_FIELDS].join(','),
    limit: String(RATINGS_BATCH_SIZE),
  })
  return `/search.json?${params.toString()}`
}

const ratingsDocSchema = z.object({
  ratings_average: z.number().min(0).max(5).optional(),
  ratings_count: z.number().int().min(0).optional(),
  ratings_count_1: z.number().int().min(0).optional(),
  ratings_count_2: z.number().int().min(0).optional(),
  ratings_count_3: z.number().int().min(0).optional(),
  ratings_count_4: z.number().int().min(0).optional(),
  ratings_count_5: z.number().int().min(0).optional(),
})

/** A search result's ratings in RePrint terms, or `null` when it has none (D-204). */
export function toSourceRating(raw: unknown): SourceRating | null {
  const doc = ratingsDocSchema.safeParse(raw)
  if (!doc.success) return null
  const { ratings_average: average, ratings_count: count } = doc.data
  if (!count || average === undefined) return null
  return {
    average,
    count,
    distribution: [
      doc.data.ratings_count_1 ?? 0,
      doc.data.ratings_count_2 ?? 0,
      doc.data.ratings_count_3 ?? 0,
      doc.data.ratings_count_4 ?? 0,
      doc.data.ratings_count_5 ?? 0,
    ],
  }
}
