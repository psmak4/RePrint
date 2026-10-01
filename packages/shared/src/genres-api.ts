import { z } from 'zod'
import { genreSchema } from './catalog.js'
import { bookSummarySchema } from './catalog-api.js'

/** Request and response shapes for browsing by Genre (PRD §7.5, §10). */

/** Books per page on a Genre page. */
export const GENRE_PAGE_SIZE = 20

export const GENRE_SORTS = ['top_rated', 'most_reviewed', 'newest_review'] as const
export const genreSortSchema = z.enum(GENRE_SORTS)
export type GenreSort = z.infer<typeof genreSortSchema>

export const genreLinkSchema = genreSchema.pick({ slug: true, name: true })
export type GenreLink = z.infer<typeof genreLinkSchema>

export interface GenreNode {
  slug: string
  name: string
  description: string | null
  featured: boolean
  children: GenreNode[]
}

/** A Genre with its child Genres, which may nest. */
export const genreNodeSchema: z.ZodType<GenreNode> = genreSchema
  .pick({ slug: true, name: true, description: true, featured: true })
  .extend({ children: z.lazy(() => z.array(genreNodeSchema)) })

/** `GET /genres`: the Genre tree, roots first, each level sorted by name. */
export const genreTreeResponseSchema = z.object({ items: z.array(genreNodeSchema) })
export type GenreTreeResponse = z.infer<typeof genreTreeResponseSchema>

/** `GET /genres/:slug?sort=&page=`. */
export const genreBooksQuerySchema = z.object({
  sort: genreSortSchema.default('top_rated'),
  page: z.coerce.number().int().min(1).max(50).default(1),
})
export type GenreBooksQuery = z.infer<typeof genreBooksQuerySchema>

/** `GET /genres/:slug`: the Genre and one page of the Books in it and its child Genres. */
export const genreDetailResponseSchema = z.object({
  genre: genreSchema.pick({ slug: true, name: true, description: true }),
  parent: genreLinkSchema.nullable(),
  children: z.array(genreLinkSchema),
  items: z.array(bookSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().positive(),
  hasMore: z.boolean(),
})
export type GenreDetailResponse = z.infer<typeof genreDetailResponseSchema>
