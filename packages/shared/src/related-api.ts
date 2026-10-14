import { z } from 'zod'
import { authorSchema, slugSchema } from './catalog.js'
import { bookSummarySchema } from './catalog-api.js'
import { genreLinkSchema } from './genres-api.js'
import { seriesEntrySchema } from './series-api.js'

/** How many other Books the Book page's Author and Genre rails show. */
export const RELATED_BOOKS_LIMIT = 6

/**
 * `GET /books/:slug/related`: what the Book page shows around a Book, from its slug alone, so the
 * page can ask for it beside the Book (M10-T06). Each part is `null` when the Book has none.
 * Reading it never imports anything (D-205).
 */
export const bookRelatedResponseSchema = z.object({
  /** The first credited Author, with up to 6 of their other Books. */
  author: authorSchema
    .pick({ slug: true, name: true, bio: true, birthDate: true, deathDate: true, photo: true })
    .extend({
      /** Every stored Book they are credited on, in any Role. */
      bookCount: z.number().int().min(0),
      books: z.array(bookSummarySchema).max(RELATED_BOOKS_LIMIT),
    })
    .nullable(),
  /** The first Series by name: the Books around this one (as `GET /series/:slug?around=`). */
  series: z
    .object({
      slug: slugSchema,
      name: z.string().trim().min(1),
      /** How many members the Source lists (D-199); `null` when unknown. */
      memberCount: z.number().int().min(0).nullable(),
      /** How many Books of the Series are stored. */
      total: z.number().int().min(0),
      items: z.array(seriesEntrySchema),
    })
    .nullable(),
  /** The first Genre by name, with up to 6 of its other Books, top rated first. */
  genre: genreLinkSchema
    .extend({ books: z.array(bookSummarySchema).max(RELATED_BOOKS_LIMIT) })
    .nullable(),
})
export type BookRelatedResponse = z.infer<typeof bookRelatedResponseSchema>
