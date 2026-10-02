import { z } from 'zod'
import { slugSchema } from './catalog.js'
import { bookSummarySchema } from './catalog-api.js'

/** Response shape for a Series page (PRD §7.5, §10). */

/** One Book in a Series. `position` may be decimal (2.5) or empty. */
export const seriesEntrySchema = z.object({
  position: z.number().nullable(),
  book: bookSummarySchema,
})
export type SeriesEntry = z.infer<typeof seriesEntrySchema>

/** `GET /series/:slug`: the Series and all its Books in reading order, empty positions last. */
export const seriesDetailResponseSchema = z.object({
  series: z.object({
    slug: slugSchema,
    name: z.string().trim().min(1),
    description: z.string().nullable(),
  }),
  items: z.array(seriesEntrySchema),
})
export type SeriesDetailResponse = z.infer<typeof seriesDetailResponseSchema>
