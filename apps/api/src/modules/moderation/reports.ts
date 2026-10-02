import { books, reviewReports, reviews, users } from '@reprint/db'
import {
  cursorQuerySchema,
  type ModReportItem,
  type ModReportsResponse,
  modReportsResponseSchema,
  type ReportDismissResponse,
  reportDismissResponseSchema,
  reportReviewIdParamsSchema,
  reviewDecisionRequestSchema,
} from '@reprint/shared'
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { decodeCursor, encodeCursor } from './cursor.js'

/** The Reports queue and dismissing reports (PRD §7.10); unpublishing is in `routes.ts`. */
export const moderationReportRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const { db } = options
  const resolve = requirePermission('reports.resolve')

  app.get(
    '/mod/reports',
    {
      preHandler: [resolve],
      schema: { querystring: cursorQuerySchema, response: { 200: modReportsResponseSchema } },
    },
    async (request): Promise<ModReportsResponse> => {
      if (!db || !request.auth) throw new Error('moderation routes need a database')
      const { cursor, limit } = request.query
      const after = cursor ? decodeCursor(cursor) : null

      // Reviews with open reports, the one reported longest ago first. Your own Review is left out
      // because you cannot handle its reports.
      const oldest = sql`min(${reviewReports.createdAt})`
      const groups = await db
        .select({
          reviewId: reviewReports.reviewId,
          openCount: count(),
          oldestText: sql<string>`${oldest}::text`,
        })
        .from(reviewReports)
        .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
        .where(and(eq(reviewReports.status, 'open'), ne(reviews.userId, request.auth.user.id)))
        .groupBy(reviewReports.reviewId)
        .having(
          after
            ? sql`(${oldest}, ${reviewReports.reviewId}) > (${after.at}::timestamptz, ${after.id}::uuid)`
            : undefined,
        )
        .orderBy(asc(oldest), asc(reviewReports.reviewId))
        .limit(limit + 1)

      const page = groups.slice(0, limit)
      const last = page.at(-1)
      const nextCursor =
        groups.length > limit && last ? encodeCursor(last.oldestText, last.reviewId) : null
      if (page.length === 0) return { items: [], meta: { nextCursor: null } }

      const reviewIds = page.map((group) => group.reviewId)
      const [reviewRows, reportRows] = await Promise.all([
        db
          .select({
            id: reviews.id,
            status: reviews.status,
            hiddenAt: reviews.hiddenAt,
            rating: reviews.rating,
            headline: reviews.headline,
            body: reviews.body,
            hasSpoilers: reviews.hasSpoilers,
            bookSlug: books.slug,
            bookTitle: books.title,
            authorId: users.id,
            username: users.username,
            displayName: users.displayName,
          })
          .from(reviews)
          .innerJoin(books, eq(books.id, reviews.bookId))
          .innerJoin(users, eq(users.id, reviews.userId))
          .where(inArray(reviews.id, reviewIds)),
        db
          .select({
            id: reviewReports.id,
            reviewId: reviewReports.reviewId,
            reason: reviewReports.reason,
            note: reviewReports.note,
            createdAt: reviewReports.createdAt,
            username: users.username,
            displayName: users.displayName,
          })
          .from(reviewReports)
          .innerJoin(users, eq(users.id, reviewReports.reporterId))
          .where(and(inArray(reviewReports.reviewId, reviewIds), eq(reviewReports.status, 'open')))
          .orderBy(asc(reviewReports.createdAt), asc(reviewReports.id)),
      ])

      const items: ModReportItem[] = []
      for (const group of page) {
        const review = reviewRows.find((row) => row.id === group.reviewId)
        const reports = reportRows.filter((row) => row.reviewId === group.reviewId)
        const first = reports[0]
        if (!review || !first) continue
        items.push({
          review: {
            id: review.id,
            status: review.status,
            hidden: review.hiddenAt !== null,
            book: { slug: review.bookSlug, title: review.bookTitle },
            author: {
              id: review.authorId,
              username: review.username,
              displayName: review.displayName,
            },
            rating: review.rating,
            headline: review.headline,
            body: review.body,
            hasSpoilers: review.hasSpoilers,
          },
          openCount: group.openCount,
          oldestReportedAt: first.createdAt.toISOString(),
          reports: reports.map((row) => ({
            id: row.id,
            reason: row.reason,
            note: row.note,
            createdAt: row.createdAt.toISOString(),
            reporter: { username: row.username, displayName: row.displayName },
          })),
        })
      }
      return { items, meta: { nextCursor } }
    },
  )

  app.post(
    '/mod/reports/:reviewId/dismiss',
    {
      preHandler: [resolve],
      schema: {
        params: reportReviewIdParamsSchema,
        body: reviewDecisionRequestSchema,
        response: { 200: reportDismissResponseSchema },
      },
    },
    async (request): Promise<ReportDismissResponse> => {
      if (!db || !request.auth) throw new Error('moderation routes need a database')
      const moderatorId = request.auth.user.id
      const { reviewId } = request.params
      const reason = request.body.reason || null

      return db.transaction(async (tx) => {
        const [review] = await tx
          .select({ userId: reviews.userId, hiddenAt: reviews.hiddenAt })
          .from(reviews)
          .where(eq(reviews.id, reviewId))
          .for('update')
        if (!review) throw new HttpProblem(404, 'Review not found.')
        if (review.userId === moderatorId) {
          throw new HttpProblem(403, 'You cannot moderate your own Review.')
        }
        const closed = await tx
          .update(reviewReports)
          .set({
            status: 'dismissed',
            resolvedBy: moderatorId,
            resolution: reason,
            resolvedAt: sql`now()`,
          })
          .where(and(eq(reviewReports.reviewId, reviewId), eq(reviewReports.status, 'open')))
          .returning({ id: reviewReports.id })
        if (closed.length === 0) {
          throw new HttpProblem(409, 'This Review has no open reports.')
        }
        // The moderator decided, so the Review comes back if the reports had hidden it.
        await tx.update(reviews).set({ hiddenAt: null }).where(eq(reviews.id, reviewId))
        await recordAudit(tx, {
          actorId: moderatorId,
          action: 'report.dismiss',
          targetType: 'review',
          targetId: reviewId,
          before: { openReports: closed.length, hidden: review.hiddenAt !== null },
          after: { openReports: 0, hidden: false, ...(reason ? { reason } : {}) },
          ip: request.ip,
        })
        return { reviewId, closedReports: closed.length }
      })
    },
  )
}
