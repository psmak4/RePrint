import { covers, reviews, users } from '@reprint/db'
import {
  buildPageMeta,
  type Profile,
  type ProfileReviewsResponse,
  profileReviewsQuerySchema,
  profileReviewsResponseSchema,
  profileSchema,
  usernameParamsSchema,
} from '@reprint/shared'
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import type { ImageStorage } from '../../storage/index.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { publicCacheHook } from '../catalog/public-cache.js'
import { loadBookSummaries } from '../catalog/read.js'

export interface ProfileRoutesOptions extends AuthRoutesOptions {
  storage: ImageStorage
}

/** Public profiles (PRD §7.8). Only `active` accounts have one; the rest answer 404 (D-143). */
export const profileRoutes: FastifyPluginAsyncZod<ProfileRoutesOptions> = async (app, options) => {
  const { db, storage } = options

  // Nothing here depends on the viewer, so these are cached like the catalog's public GETs.
  app.addHook('onSend', publicCacheHook)

  async function activeMember(username: string) {
    if (!db) throw new Error('profile routes need a database')
    const [member] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        bio: users.bio,
        libraryPublic: users.libraryPublic,
        createdAt: users.createdAt,
        avatarKey: covers.r2Key,
      })
      .from(users)
      .leftJoin(covers, eq(covers.id, users.avatarId))
      .where(and(eq(users.username, username), eq(users.status, 'active')))
    if (!member) throw new HttpProblem(404, 'We could not find that Member.')
    return member
  }

  const approvedBy = (userId: string) =>
    and(eq(reviews.userId, userId), eq(reviews.status, 'approved'), isNull(reviews.hiddenAt))

  app.get(
    '/users/:username',
    { schema: { params: usernameParamsSchema, response: { 200: profileSchema } } },
    async (request): Promise<Profile> => {
      if (!db) throw new Error('profile routes need a database')
      const member = await activeMember(request.params.username)
      const [totals] = await db
        .select({
          reviewCount: count(),
          helpfulVotes: sql<number>`coalesce(sum(${reviews.helpfulCount}), 0)::int`,
        })
        .from(reviews)
        .where(approvedBy(member.id))
      return {
        username: member.username,
        displayName: member.displayName,
        bio: member.bio,
        avatarUrl: member.avatarKey ? storage.url(member.avatarKey) : null,
        joinedAt: member.createdAt.toISOString(),
        reviewCount: totals?.reviewCount ?? 0,
        helpfulVotes: totals?.helpfulVotes ?? 0,
        libraryPublic: member.libraryPublic,
      }
    },
  )

  app.get(
    '/users/:username/reviews',
    {
      schema: {
        params: usernameParamsSchema,
        querystring: profileReviewsQuerySchema,
        response: { 200: profileReviewsResponseSchema },
      },
    },
    async (request): Promise<ProfileReviewsResponse> => {
      if (!db) throw new Error('profile routes need a database')
      const { page, pageSize } = request.query
      const member = await activeMember(request.params.username)
      const where = approvedBy(member.id)
      const [totalRow] = await db.select({ total: count() }).from(reviews).where(where)
      const rows = await db
        .select()
        .from(reviews)
        .where(where)
        .orderBy(desc(reviews.submittedAt), desc(reviews.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
      const summaries = await loadBookSummaries(
        db,
        rows.map((row) => row.bookId),
      )
      const byId = new Map(summaries.map((book) => [book.id, book]))
      const items = rows.flatMap((row) => {
        const book = byId.get(row.bookId)
        if (!book) return []
        return [
          {
            id: row.id,
            rating: row.rating,
            headline: row.headline,
            body: row.body,
            hasSpoilers: row.hasSpoilers,
            helpfulCount: row.helpfulCount,
            submittedAt: row.submittedAt.toISOString(),
            book,
          },
        ]
      })
      return { items, meta: buildPageMeta({ page, pageSize }, totalRow?.total ?? 0) }
    },
  )
}
