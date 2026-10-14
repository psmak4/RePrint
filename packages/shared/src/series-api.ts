import { z } from 'zod'
import { slugSchema } from './catalog.js'
import { bookSummarySchema } from './catalog-api.js'
import { SERIES_WINDOW } from './ui-constants.js'

/** Response shape for a Series page (PRD §7.5, §10). */

/** One Book in a Series. `position` may be decimal (2.5) or empty. */
export const seriesEntrySchema = z.object({
  position: z.number().nullable(),
  book: bookSummarySchema,
})
export type SeriesEntry = z.infer<typeof seriesEntrySchema>

/**
 * `GET /series/:slug?around=<book slug>`: with `around`, only the `SERIES_WINDOW` Books around that
 * Book, so a Book page never loads a long Series whole (D-199).
 */
export const seriesDetailQuerySchema = z.object({ around: slugSchema.optional() })

/** `GET /series/:slug`: the Series and its Books in reading order, empty positions last. */
export const seriesDetailResponseSchema = z.object({
  series: z.object({
    slug: slugSchema,
    name: z.string().trim().min(1),
    description: z.string().nullable(),
    /** How many members the Source lists (D-199); `null` when unknown. Stored Books may be fewer. */
    memberCount: z.number().int().min(0).nullable(),
    /** True while a recent sync is still importing members the Source lists (D-199). */
    adding: z.boolean(),
  }),
  items: z.array(seriesEntrySchema),
  /** How many Books of the Series are stored; `items` holds all of them unless `around` was sent. */
  total: z.number().int().min(0),
})
export type SeriesDetailResponse = z.infer<typeof seriesDetailResponseSchema>
