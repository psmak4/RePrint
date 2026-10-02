import { books, shelfEntries } from '@reprint/db'
import {
  type ShelfResponse,
  setShelfInputSchema,
  shelfResponseSchema,
  slugParamsSchema,
} from '@reprint/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { rateLimit } from '../rate-limit/plugin.js'

/**
 * Shelving (PRD §7.7). Any signed-in Member may shelve, verified or not, and shelving never
 * touches reviews.
 */
export const libraryRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options

  async function bookIdFor(slug: string): Promise<string> {
    if (!db) throw new Error('library routes need a database')
    const [book] = await db.select({ id: books.id }).from(books).where(eq(books.slug, slug))
    if (!book) throw new HttpProblem(404, 'Book not found.')
    return book.id
  }

  app.put(
    '/books/:slug/shelf',
    {
      preHandler: [requireAuth, rateLimit('authenticatedWrite')],
      schema: {
        params: slugParamsSchema,
        body: setShelfInputSchema,
        response: { 200: shelfResponseSchema },
      },
    },
    async (request): Promise<ShelfResponse> => {
      if (!db || !request.auth) throw new Error('library routes need a database')
      const bookId = await bookIdFor(request.params.slug)
      const { shelf } = request.body
      // One row per Member per Book: a second PUT moves the Book and keeps `added_at`.
      await db
        .insert(shelfEntries)
        .values({ userId: request.auth.user.id, bookId, shelf })
        .onConflictDoUpdate({
          target: [shelfEntries.userId, shelfEntries.bookId],
          set: { shelf, updatedAt: sql`now()` },
        })
      return { shelf }
    },
  )

  app.delete(
    '/books/:slug/shelf',
    {
      preHandler: [requireAuth, rateLimit('authenticatedWrite')],
      schema: { params: slugParamsSchema, response: { 200: shelfResponseSchema } },
    },
    async (request): Promise<ShelfResponse> => {
      if (!db || !request.auth) throw new Error('library routes need a database')
      const bookId = await bookIdFor(request.params.slug)
      // Removing a Book that is not shelved is not an error.
      await db
        .delete(shelfEntries)
        .where(and(eq(shelfEntries.userId, request.auth.user.id), eq(shelfEntries.bookId, bookId)))
      return { shelf: null }
    },
  )
}
