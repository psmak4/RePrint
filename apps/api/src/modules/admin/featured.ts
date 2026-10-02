import { type Database, featuredItems, genres, reviews } from '@reprint/db'
import {
  ADMIN_FEATURED_CANDIDATES,
  type AdminFeatured,
  adminFeaturedSchema,
  adminFeaturedUpdateSchema,
} from '@reprint/shared'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Redis } from 'ioredis'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { rebuildDiscover } from '../discover/cache.js'
import { loadFeaturedReviews } from '../discover/rows.js'

type Reader = Pick<Database, 'select'>

export interface AdminFeaturedRoutesOptions extends AuthRoutesOptions {
  redis?: Redis
}

function invalid(path: string, message: string): HttpProblem {
  return new HttpProblem(400, 'The request did not pass validation.', {
    errors: [{ path, message }],
  })
}

async function currentGenres(tx: Reader) {
  return tx
    .select({ id: genres.id, slug: genres.slug, name: genres.name })
    .from(featuredItems)
    .innerJoin(genres, eq(genres.id, featuredItems.refId))
    .where(and(eq(featuredItems.kind, 'genre'), isNull(genres.archivedAt)))
    .orderBy(asc(featuredItems.position), asc(genres.name))
}

async function currentReviewId(tx: Reader): Promise<string | null> {
  const [row] = await tx
    .select({ refId: featuredItems.refId })
    .from(featuredItems)
    .where(eq(featuredItems.kind, 'review'))
    .orderBy(asc(featuredItems.position), asc(featuredItems.createdAt))
    .limit(1)
  return row?.refId ?? null
}

async function loadView(db: Database): Promise<AdminFeatured> {
  const [picked, options, reviewId, helpful] = await Promise.all([
    currentGenres(db),
    db
      .select({ id: genres.id, slug: genres.slug, name: genres.name })
      .from(genres)
      .where(isNull(genres.archivedAt))
      .orderBy(asc(genres.name), asc(genres.id)),
    currentReviewId(db),
    db
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.status, 'approved'), isNull(reviews.hiddenAt)))
      .orderBy(desc(reviews.helpfulCount), desc(reviews.decidedAt), asc(reviews.id))
      .limit(ADMIN_FEATURED_CANDIDATES),
  ])
  const [review] = reviewId ? await loadFeaturedReviews(db, [reviewId]) : []
  return {
    genres: picked,
    genreOptions: options,
    review: review ?? null,
    candidates: await loadFeaturedReviews(
      db,
      helpful.map((row) => row.id),
    ),
  }
}

/** The featured Genres and the featured review (PRD §7.2, §7.11, D-045, D-161). */
export const adminFeaturedRoutes: FastifyPluginAsyncZod<AdminFeaturedRoutesOptions> = async (
  app,
  options,
) => {
  const { db, redis } = options
  const manage = requirePermission('featured.manage')
  // Choosing Genres needs a second permission, so a Moderator can set only the review (D-045).
  const genresGuard = requirePermission('featured.genres')

  app.get(
    '/admin/featured',
    { preHandler: [manage], schema: { response: { 200: adminFeaturedSchema } } },
    async (): Promise<AdminFeatured> => {
      if (!db) throw new Error('admin routes need a database')
      return loadView(db)
    },
  )

  app.put(
    '/admin/featured',
    {
      preHandler: [
        manage,
        async (request, reply) => {
          const body = request.body as { genreIds?: unknown } | null
          if (body && typeof body === 'object' && body.genreIds !== undefined) {
            await genresGuard.call(app, request, reply)
          }
        },
      ],
      schema: { body: adminFeaturedUpdateSchema, response: { 200: adminFeaturedSchema } },
    },
    async (request): Promise<AdminFeatured> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { genreIds, reviewId } = request.body
      await db.transaction(async (tx) => {
        const before = {
          genres: (await currentGenres(tx)).map((genre) => genre.slug),
          reviewId: await currentReviewId(tx),
        }
        let afterGenres = before.genres
        let afterReviewId = before.reviewId

        if (genreIds !== undefined) {
          const rows = genreIds.length
            ? await tx
                .select({ id: genres.id, slug: genres.slug })
                .from(genres)
                .where(and(inArray(genres.id, genreIds), isNull(genres.archivedAt)))
            : []
          const bySlug = new Map(rows.map((row) => [row.id, row.slug]))
          const missing = genreIds.findIndex((id) => !bySlug.has(id))
          if (missing >= 0) throw invalid(`genreIds.${missing}`, 'Choose an existing Genre.')
          await tx.delete(featuredItems).where(eq(featuredItems.kind, 'genre'))
          if (genreIds.length > 0) {
            await tx
              .insert(featuredItems)
              .values(
                genreIds.map((id, position) => ({ kind: 'genre' as const, refId: id, position })),
              )
          }
          // The public Genre list reads `genres.featured`; keep it in step with the picks.
          await tx.update(genres).set({ featured: false }).where(eq(genres.featured, true))
          if (genreIds.length > 0) {
            await tx.update(genres).set({ featured: true }).where(inArray(genres.id, genreIds))
          }
          afterGenres = genreIds.map((id) => bySlug.get(id) ?? id)
        }

        if (reviewId !== undefined) {
          if (reviewId !== null) {
            const [row] = await tx
              .select({ status: reviews.status, hiddenAt: reviews.hiddenAt })
              .from(reviews)
              .where(eq(reviews.id, reviewId))
            if (!row) throw invalid('reviewId', 'Choose an existing review.')
            if (row.status !== 'approved' || row.hiddenAt !== null) {
              throw invalid('reviewId', 'Only an Approved review can be featured.')
            }
          }
          await tx.delete(featuredItems).where(eq(featuredItems.kind, 'review'))
          if (reviewId !== null) {
            await tx.insert(featuredItems).values({ kind: 'review', refId: reviewId, position: 0 })
          }
          afterReviewId = reviewId
        }

        await recordAudit(tx, {
          actorId,
          action: 'featured.change',
          targetType: 'featured_item',
          targetId: null,
          before,
          after: { genres: afterGenres, reviewId: afterReviewId },
          ip: request.ip,
        })
      })
      // Discover reads a cache; rebuild it now so the change shows without waiting for the next
      // 10-minute run. A cache failure must not undo the saved change, so the job catches up.
      if (redis) await rebuildDiscover(db, redis).catch((error) => request.log.warn({ error }))
      return loadView(db)
    },
  )
}
