import { z } from 'zod'
import { SHELVES } from './shelf-names.js'

export const shelfSchema = z.enum(SHELVES)

/** `PUT /books/:slug/shelf` body. */
export const setShelfInputSchema = z.object({ shelf: shelfSchema })
export type SetShelfInput = z.infer<typeof setShelfInputSchema>

/** `PUT` and `DELETE /books/:slug/shelf`: the viewer's Shelf for the Book after the change (`null` once removed). */
export const shelfResponseSchema = z.object({ shelf: shelfSchema.nullable() })
export type ShelfResponse = z.infer<typeof shelfResponseSchema>
