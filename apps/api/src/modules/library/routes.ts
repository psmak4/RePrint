import { authors, books, contributions, shelfEntries, users } from '@reprint/db'
import {
  buildPageMeta,
  type LibraryResponse,
  libraryQuerySchema,
  libraryResponseSchema,
  type ShelfResponse,
  setShelfInputSchema,
  shelfResponseSchema,
  slugParamsSchema,
  usernameParamsSchema,
} from '@reprint/shared'
import { and, asc, count, desc, eq, type SQL, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { PRIVATE_CACHE_CONTROL } from '../catalog/public-cache.js'
import { loadBookSummaries } from '../catalog/read.js'
import { rateLimit } from '../rate-limit/plugin.js'

/**
 * Shelving and Libraries (PRD §7.7). Any signed-in Member may shelve, verified or not, and shelving never
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

  app.get(
    '/users/:username/library',
    {
      schema: {
        params: usernameParamsSchema,
        querystring: libraryQuerySchema,
        response: { 200: libraryResponseSchema },
      },
    },
    async (request, reply): Promise<LibraryResponse> => {
      if (!db) throw new Error('library routes need a database')
      const [owner] = await db
        .select({ id: users.id, libraryPublic: users.libraryPublic })
        .from(users)
        .where(and(eq(users.username, request.params.username), eq(users.status, 'active')))
      // A private library answers like a missing one, so its existence is not revealed (D-141).
      if (!owner || (!owner.libraryPublic && request.auth?.user.id !== owner.id)) {
        throw new HttpProblem(404, 'We could not find that library.')
      }
      // Libraries are viewer-dependent (privacy), so shared caches must not keep them.
      reply.header('Cache-Control', PRIVATE_CACHE_CONTROL).header('Vary', 'Cookie')

      const { shelf, sort, page, pageSize } = request.query
      const countRows = await db
        .select({ shelf: shelfEntries.shelf, total: count() })
        .from(shelfEntries)
        .where(eq(shelfEntries.userId, owner.id))
        .groupBy(shelfEntries.shelf)
      const counts = { all: 0, want_to_read: 0, reading: 0, read: 0 }
      for (const row of countRows) {
        counts[row.shelf] = row.total
        counts.all += row.total
      }

      // First credited Author's name, for sorting by author; Books with none sort last.
      const firstAuthor = sql<string | null>`(
        select ${authors.name} from ${contributions}
        inner join ${authors} on ${authors.id} = ${contributions.authorId}
        where ${contributions.bookId} = ${books.id}
        order by ${contributions.position}, ${authors.name} limit 1)`
      const orderBy: SQL[] = {
        added_desc: [desc(shelfEntries.addedAt)],
        added_asc: [asc(shelfEntries.addedAt)],
        title: [asc(books.title)],
        author: [sql`${firstAuthor} asc nulls last`, asc(books.title)],
      }[sort]
      const rows = await db
        .select({
          bookId: shelfEntries.bookId,
          shelf: shelfEntries.shelf,
          addedAt: shelfEntries.addedAt,
        })
        .from(shelfEntries)
        .innerJoin(books, eq(books.id, shelfEntries.bookId))
        .where(
          and(eq(shelfEntries.userId, owner.id), shelf ? eq(shelfEntries.shelf, shelf) : undefined),
        )
        .orderBy(...orderBy, asc(shelfEntries.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      const summaries = await loadBookSummaries(
        db,
        rows.map((row) => row.bookId),
      )
      const byId = new Map(summaries.map((book) => [book.id, book]))
      const items = rows.flatMap((row) => {
        const book = byId.get(row.bookId)
        return book ? [{ shelf: row.shelf, addedAt: row.addedAt.toISOString(), book }] : []
      })
      return {
        items,
        meta: buildPageMeta({ page, pageSize }, shelf ? counts[shelf] : counts.all),
        counts,
      }
    },
  )
}
