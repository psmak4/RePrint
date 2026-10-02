import { z } from 'zod'

/** The three Shelves (PRD §5.3, §7.7). A Book is on at most one per Member. */
export const SHELVES = ['want_to_read', 'reading', 'read'] as const
export const shelfSchema = z.enum(SHELVES)
export type Shelf = z.infer<typeof shelfSchema>

/** `PUT /books/:slug/shelf` body. */
export const setShelfInputSchema = z.object({ shelf: shelfSchema })
export type SetShelfInput = z.infer<typeof setShelfInputSchema>

/** `PUT` and `DELETE /books/:slug/shelf`: the viewer's Shelf for the Book after the change (`null` once removed). */
export const shelfResponseSchema = z.object({ shelf: shelfSchema.nullable() })
export type ShelfResponse = z.infer<typeof shelfResponseSchema>
