import { books, reviewClaims, reviews, reviewVersions, users } from '@reprint/db'
import {
  type ClaimReviewResponse,
  claimReviewResponseSchema,
  cursorQuerySchema,
  type ModQueueItem,
  type ModQueueResponse,
  type ModStats,
  modQueueResponseSchema,
  modStatsSchema,
  REVIEW_CLAIM_MINUTES,
  reviewIdParamsSchema,
} from '@reprint/shared'
import { and, asc, count, eq, gt, inArray, min, ne, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HttpProblem } from '../../errors.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

/** Timestamps travel as Postgres text so microseconds survive the round trip through a cursor. */
const TIMESTAMPTZ_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/
const cursorPayloadSchema = z.object({
  at: z.string().regex(TIMESTAMPTZ_TEXT),
  id: z.uuid(),
})

function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify({ at, id })).toString('base64url')
}

function decodeCursor(cursor: string): z.infer<typeof cursorPayloadSchema> {
  try {
    return cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    throw new HttpProblem(400, 'The request did not pass validation.', {
      errors: [{ path: 'query.cursor', message: 'That cursor is not valid.' }],
    })
  }
}

export const moderationRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const moderate = requirePermission('reviews.moderate')

  app.get(
    '/mod/reviews',
    {
      preHandler: [moderate],
      schema: { querystring: cursorQuerySchema, response: { 200: modQueueResponseSchema } },
    },
    async (request): Promise<ModQueueResponse> => {
      if (!db || !request.auth) throw new Error('moderation routes need a database')
      const moderatorId = request.auth.user.id
      const { cursor, limit } = request.query
      const after = cursor ? decodeCursor(cursor) : null

      // Pending only, oldest first, never the viewer's own Reviews (they cannot decide them).
      const rows = await db
        .select({
          id: reviews.id,
          userId: reviews.userId,
          rating: reviews.rating,
          headline: reviews.headline,
          body: reviews.body,
          hasSpoilers: reviews.hasSpoilers,
          editionId: reviews.editionId,
          submittedAt: reviews.submittedAt,
          submittedAtText: sql<string>`${reviews.submittedAt}::text`,
          bookSlug: books.slug,
          bookTitle: books.title,
          username: users.username,
          displayName: users.displayName,
        })
        .from(reviews)
        .innerJoin(books, eq(books.id, reviews.bookId))
        .innerJoin(users, eq(users.id, reviews.userId))
        .where(
          and(
            eq(reviews.status, 'pending'),
            ne(reviews.userId, moderatorId),
            after
              ? sql`(${reviews.submittedAt}, ${reviews.id}) > (${after.at}::timestamptz, ${after.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(asc(reviews.submittedAt), asc(reviews.id))
        .limit(limit + 1)

      const page = rows.slice(0, limit)
      const last = page.at(-1)
      const nextCursor =
        rows.length > limit && last ? encodeCursor(last.submittedAtText, last.id) : null
      if (page.length === 0) return { items: [], meta: { nextCursor: null } }

      const reviewIds = page.map((row) => row.id)
      const userIds = [...new Set(page.map((row) => row.userId))]

      const [versionRows, historyRows, claimRows] = await Promise.all([
        // The newest version of each Review is the Pending one; the newest approved one before it
        // is what an edit is compared with.
        db
          .selectDistinctOn([reviewVersions.reviewId], {
            reviewId: reviewVersions.reviewId,
            version: reviewVersions.version,
            status: reviewVersions.status,
            rating: reviewVersions.rating,
            headline: reviewVersions.headline,
            body: reviewVersions.body,
            hasSpoilers: reviewVersions.hasSpoilers,
            decidedAt: reviewVersions.decidedAt,
          })
          .from(reviewVersions)
          .where(
            and(inArray(reviewVersions.reviewId, reviewIds), eq(reviewVersions.status, 'approved')),
          )
          .orderBy(reviewVersions.reviewId, sql`${reviewVersions.version} desc`),
        db
          .select({
            userId: reviews.userId,
            status: reviewVersions.status,
            total: count(),
          })
          .from(reviewVersions)
          .innerJoin(reviews, eq(reviews.id, reviewVersions.reviewId))
          .where(
            and(
              inArray(reviews.userId, userIds),
              inArray(reviewVersions.status, ['approved', 'rejected']),
            ),
          )
          .groupBy(reviews.userId, reviewVersions.status),
        db
          .select({
            reviewId: reviewClaims.reviewId,
            moderatorId: reviewClaims.moderatorId,
            expiresAt: reviewClaims.expiresAt,
            username: users.username,
            displayName: users.displayName,
          })
          .from(reviewClaims)
          .innerJoin(users, eq(users.id, reviewClaims.moderatorId))
          .where(
            and(inArray(reviewClaims.reviewId, reviewIds), gt(reviewClaims.expiresAt, sql`now()`)),
          ),
      ])
      const currentVersions = await db
        .select({
          reviewId: reviewVersions.reviewId,
          version: sql<number>`max(${reviewVersions.version})::int`,
        })
        .from(reviewVersions)
        .where(inArray(reviewVersions.reviewId, reviewIds))
        .groupBy(reviewVersions.reviewId)

      const approvedBefore = new Map(versionRows.map((row) => [row.reviewId, row]))
      const currentVersion = new Map(currentVersions.map((row) => [row.reviewId, row.version]))
      const claims = new Map(claimRows.map((row) => [row.reviewId, row]))
      const counts = (userId: string, status: 'approved' | 'rejected') =>
        historyRows.find((row) => row.userId === userId && row.status === status)?.total ?? 0

      const items = page.map((row): ModQueueItem => {
        const approved = approvedBefore.get(row.id)
        const claim = claims.get(row.id)
        return {
          id: row.id,
          book: { slug: row.bookSlug, title: row.bookTitle },
          reviewer: {
            username: row.username,
            displayName: row.displayName,
            approvedCount: counts(row.userId, 'approved'),
            rejectedCount: counts(row.userId, 'rejected'),
            // Reports arrive in M7 (D-121).
            reportedCount: 0,
          },
          rating: row.rating,
          headline: row.headline,
          body: row.body,
          hasSpoilers: row.hasSpoilers,
          editionId: row.editionId,
          version: currentVersion.get(row.id) ?? 1,
          submittedAt: row.submittedAt.toISOString(),
          lastApproved: approved
            ? {
                rating: approved.rating,
                headline: approved.headline,
                body: approved.body,
                hasSpoilers: approved.hasSpoilers,
                decidedAt: approved.decidedAt?.toISOString() ?? null,
              }
            : null,
          claim: claim
            ? {
                expiresAt: claim.expiresAt.toISOString(),
                mine: claim.moderatorId === moderatorId,
                moderator: { username: claim.username, displayName: claim.displayName },
              }
            : null,
        }
      })
      return { items, meta: { nextCursor } }
    },
  )

  app.post(
    '/mod/reviews/:id/claim',
    {
      preHandler: [moderate],
      schema: { params: reviewIdParamsSchema, response: { 200: claimReviewResponseSchema } },
    },
    async (request): Promise<ClaimReviewResponse> => {
      if (!db || !request.auth) throw new Error('moderation routes need a database')
      const moderatorId = request.auth.user.id
      const reviewId = request.params.id
      return db.transaction(async (tx) => {
        const [review] = await tx
          .select({ status: reviews.status, userId: reviews.userId })
          .from(reviews)
          .where(eq(reviews.id, reviewId))
          .for('update')
        if (!review) throw new HttpProblem(404, 'Review not found.')
        if (review.userId === moderatorId) {
          throw new HttpProblem(403, 'You cannot moderate your own Review.')
        }
        if (review.status !== 'pending') {
          throw new HttpProblem(409, 'This Review is no longer waiting for a decision.')
        }
        // Take the claim if there is none, it is ours (renewing it), or it has expired.
        const expiresAt = sql`now() + make_interval(mins => ${REVIEW_CLAIM_MINUTES})`
        const [claim] = await tx
          .insert(reviewClaims)
          .values({ reviewId, moderatorId, expiresAt })
          .onConflictDoUpdate({
            target: reviewClaims.reviewId,
            set: { moderatorId, claimedAt: sql`now()`, expiresAt },
            setWhere: sql`${reviewClaims.moderatorId} = ${moderatorId} or ${reviewClaims.expiresAt} <= now()`,
          })
          .returning({ expiresAt: reviewClaims.expiresAt })
        if (!claim) throw new HttpProblem(409, 'Another Moderator is handling this Review.')
        return { reviewId, expiresAt: claim.expiresAt.toISOString() }
      })
    },
  )

  app.get(
    '/mod/stats',
    { preHandler: [moderate], schema: { response: { 200: modStatsSchema } } },
    async (): Promise<ModStats> => {
      if (!db) throw new Error('moderation routes need a database')
      const [row] = await db
        .select({ pendingCount: count(), oldest: min(reviews.submittedAt) })
        .from(reviews)
        .where(eq(reviews.status, 'pending'))
      const oldest = row?.oldest ?? null
      return {
        pendingCount: row?.pendingCount ?? 0,
        oldestPendingAt: oldest ? new Date(oldest).toISOString() : null,
        oldestPendingAgeSeconds: oldest
          ? Math.max(0, Math.floor((Date.now() - new Date(oldest).getTime()) / 1000))
          : null,
      }
    },
  )
}
