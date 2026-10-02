import { z } from 'zod'
import { bookSummarySchema } from './catalog-api.js'
import { pageOf, pageQuerySchema } from './pagination.js'
import { shelfSchema } from './shelves.js'

/** Request and response shapes for a Member's Library (PRD §7.7, §10). */

export const LIBRARY_SORTS = ['added_desc', 'added_asc', 'title', 'author'] as const
export const librarySortSchema = z.enum(LIBRARY_SORTS)
export type LibrarySort = z.infer<typeof librarySortSchema>

export const usernameParamsSchema = z.object({ username: z.string().min(1).max(64) })

/** `GET /users/:username/library?shelf=&sort=&page=&pageSize=`; no `shelf` means all Shelves. */
export const libraryQuerySchema = pageQuerySchema.extend({
  shelf: shelfSchema.optional(),
  sort: librarySortSchema.default('added_desc'),
})
export type LibraryQuery = z.infer<typeof libraryQuerySchema>

/** Shelf entries per Shelf, plus the total, for the tab counts. */
export const libraryCountsSchema = z.object({
  all: z.number().int().min(0),
  want_to_read: z.number().int().min(0),
  reading: z.number().int().min(0),
  read: z.number().int().min(0),
})
export type LibraryCounts = z.infer<typeof libraryCountsSchema>

export const libraryEntrySchema = z.object({
  shelf: shelfSchema,
  addedAt: z.iso.datetime(),
  book: bookSummarySchema,
})
export type LibraryEntry = z.infer<typeof libraryEntrySchema>

export const libraryResponseSchema = pageOf(libraryEntrySchema).extend({
  counts: libraryCountsSchema,
})
export type LibraryResponse = z.infer<typeof libraryResponseSchema>
