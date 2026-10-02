import { type Database, shelfEntries } from '@reprint/db'
import type { Shelf } from '@reprint/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { markViewerSpecific } from '../catalog/public-cache.js'

interface Shelvable {
  id: string
  viewerShelf?: Shelf | null | undefined
}

/**
 * Sets `viewerShelf` on each Book for a signed-in viewer (`null` when it is on no Shelf) and marks
 * the response private. Visitors get the Books untouched (PRD §7.7, D-139).
 */
export async function addViewerShelves<T extends Shelvable>(
  db: Database,
  request: FastifyRequest,
  books: T[],
): Promise<void> {
  if (!request.auth) return
  markViewerSpecific(request)
  const ids = [...new Set(books.map((book) => book.id))]
  if (ids.length === 0) return
  const rows = await db
    .select({ bookId: shelfEntries.bookId, shelf: shelfEntries.shelf })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.userId, request.auth.user.id), inArray(shelfEntries.bookId, ids)))
  const shelves = new Map(rows.map((row) => [row.bookId, row.shelf]))
  for (const book of books) book.viewerShelf = shelves.get(book.id) ?? null
}
