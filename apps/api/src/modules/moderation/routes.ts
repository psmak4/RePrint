import { books, reviewClaims, reviewReports, reviews, reviewVersions, users } from '@reprint/db'
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
  type ReviewDecisionResponse,
  type ReviewUnpublishResponse,
  reviewDecisionRequestSchema,
  reviewDecisionResponseSchema,
  reviewIdParamsSchema,
  reviewUnpublishRequestSchema,
  reviewUnpublishResponseSchema,
} from '@reprint/shared'
import { and, asc, count, eq, gt, inArray, min, ne, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { notify } from '../notifications/notify.js'
import { applyReviewChange } from '../reviews/aggregates.js'
import { decodeCursor, encodeCursor } from './cursor.js'
import { moderationReportRoutes } from './reports.js'

export const moderationRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db, jobs, env } = options
  const webBase = (env.WEB_URL ?? env.WEB_ORIGINS[0] ?? '').replace(/\/$/, '')
  const moderate = requirePermission('reviews.moderate')

  async function sendDecisionEmail(
    log: { error: (obj: object, msg: string) => void },
    author: { email: string; username: string; bookTitle: string; bookSlug: string },
    decision: 'approved' | 'rejected' | 'unpublished',
    reason: string | null,
  ) {
    if (!jobs) return
    try {
      await jobs.enqueue('email.send', {
        template: 'review-decision',
        to: author.email,
        props: {
          username: author.username,
          bookTitle: author.bookTitle,
          decision,
          ...(reason ? { reason } : {}),
          bookUrl: `${webBase}/books/${author.bookSlug}`,
        },
      })
    } catch (error) {
      log.error({ err: error }, 'could not queue the review decision email')
    }
  }

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

      const [versionRows, historyRows, claimRows, reportRows] = await Promise.all([
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
        // Reports filed on each reviewer's Reviews, whatever their outcome (D-148).
        db
          .select({ userId: reviews.userId, total: count() })
          .from(reviewReports)
          .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
          .where(inArray(reviews.userId, userIds))
          .groupBy(reviews.userId),
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
            reportedCount: reportRows.find((entry) => entry.userId === row.userId)?.total ?? 0,
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

  for (const decision of ['approved', 'rejected'] as const) {
    app.post(
      `/mod/reviews/:id/${decision === 'approved' ? 'approve' : 'reject'}`,
      {
        preHandler: [moderate],
        schema: {
          params: reviewIdParamsSchema,
          body: reviewDecisionRequestSchema,
          response: { 200: reviewDecisionResponseSchema },
        },
      },
      async (request): Promise<ReviewDecisionResponse> => {
        if (!db || !request.auth) throw new Error('moderation routes need a database')
        const moderatorId = request.auth.user.id
        const reviewId = request.params.id
        const reason = request.body.reason || null

        const outcome = await db.transaction(async (tx) => {
          const [review] = await tx
            .select({
              id: reviews.id,
              userId: reviews.userId,
              bookId: reviews.bookId,
              rating: reviews.rating,
              status: reviews.status,
              bookSlug: books.slug,
              bookTitle: books.title,
              username: users.username,
              email: users.email,
              emailReviewDecisions: users.emailReviewDecisions,
            })
            .from(reviews)
            .innerJoin(books, eq(books.id, reviews.bookId))
            .innerJoin(users, eq(users.id, reviews.userId))
            .where(eq(reviews.id, reviewId))
            .for('update', { of: reviews })
          if (!review) throw new HttpProblem(404, 'Review not found.')
          if (review.userId === moderatorId) {
            throw new HttpProblem(403, 'You cannot moderate your own Review.')
          }
          if (review.status !== 'pending') {
            throw new HttpProblem(409, 'This Review is no longer waiting for a decision.')
          }
          const [claim] = await tx
            .select({ moderatorId: reviewClaims.moderatorId })
            .from(reviewClaims)
            .where(and(eq(reviewClaims.reviewId, reviewId), gt(reviewClaims.expiresAt, sql`now()`)))
          if (claim && claim.moderatorId !== moderatorId) {
            throw new HttpProblem(409, 'Another Moderator is handling this Review.')
          }

          // The newest version is the one under review.
          const [version] = await tx
            .select({ id: reviewVersions.id })
            .from(reviewVersions)
            .where(eq(reviewVersions.reviewId, reviewId))
            .orderBy(sql`${reviewVersions.version} desc`)
            .limit(1)
          if (!version) throw new Error(`review ${reviewId} has no versions`)

          const decidedAt = new Date()
          await tx
            .update(reviewVersions)
            .set({ status: decision, decidedBy: moderatorId, decisionReason: reason, decidedAt })
            .where(eq(reviewVersions.id, version.id))
          await tx
            .update(reviews)
            .set({ status: decision, decidedAt, updatedAt: decidedAt })
            .where(eq(reviews.id, reviewId))
          await applyReviewChange(
            tx,
            review.bookId,
            { status: 'pending', rating: review.rating },
            { status: decision, rating: review.rating },
          )
          await tx.delete(reviewClaims).where(eq(reviewClaims.reviewId, reviewId))
          await notify(
            tx,
            review.userId,
            decision === 'approved' ? 'review_approved' : 'review_rejected',
            {
              reviewId,
              bookSlug: review.bookSlug,
              bookTitle: review.bookTitle,
              ...(reason ? { reason } : {}),
            },
          )
          await recordAudit(tx, {
            actorId: moderatorId,
            action: decision === 'approved' ? 'review.approve' : 'review.reject',
            targetType: 'review',
            targetId: reviewId,
            before: { status: 'pending' },
            after: { status: decision, ...(reason ? { reason } : {}) },
            ip: request.ip,
          })
          return review
        })

        if (outcome.emailReviewDecisions) {
          await sendDecisionEmail(request.log, outcome, decision, reason)
        }
        return { reviewId, status: decision }
      },
    )
  }

  app.post(
    '/mod/reviews/:id/unpublish',
    {
      preHandler: [moderate],
      schema: {
        params: reviewIdParamsSchema,
        body: reviewUnpublishRequestSchema,
        response: { 200: reviewUnpublishResponseSchema },
      },
    },
    async (request): Promise<ReviewUnpublishResponse> => {
      if (!db || !request.auth) throw new Error('moderation routes need a database')
      const moderatorId = request.auth.user.id
      const reviewId = request.params.id
      const { reason } = request.body

      const outcome = await db.transaction(async (tx) => {
        const [review] = await tx
          .select({
            id: reviews.id,
            userId: reviews.userId,
            bookId: reviews.bookId,
            rating: reviews.rating,
            headline: reviews.headline,
            body: reviews.body,
            hasSpoilers: reviews.hasSpoilers,
            editionId: reviews.editionId,
            status: reviews.status,
            bookSlug: books.slug,
            bookTitle: books.title,
            username: users.username,
            email: users.email,
            emailReviewDecisions: users.emailReviewDecisions,
          })
          .from(reviews)
          .innerJoin(books, eq(books.id, reviews.bookId))
          .innerJoin(users, eq(users.id, reviews.userId))
          .where(eq(reviews.id, reviewId))
          .for('update', { of: reviews })
        if (!review) throw new HttpProblem(404, 'Review not found.')
        if (review.userId === moderatorId) {
          throw new HttpProblem(403, 'You cannot moderate your own Review.')
        }
        if (review.status !== 'approved') {
          throw new HttpProblem(409, 'Only an Approved Review can be unpublished.')
        }

        // Like a decision, an unpublish is its own version, so the history shows who took it down.
        const [latest] = await tx
          .select({ version: sql<number>`max(${reviewVersions.version})::int` })
          .from(reviewVersions)
          .where(eq(reviewVersions.reviewId, reviewId))
        const decidedAt = new Date()
        await tx.insert(reviewVersions).values({
          reviewId,
          version: (latest?.version ?? 0) + 1,
          rating: review.rating,
          headline: review.headline,
          body: review.body,
          hasSpoilers: review.hasSpoilers,
          editionId: review.editionId,
          status: 'unpublished',
          decidedBy: moderatorId,
          decisionReason: reason,
          decidedAt,
        })
        await tx
          .update(reviews)
          .set({ status: 'unpublished', hiddenAt: null, decidedAt, updatedAt: decidedAt })
          .where(eq(reviews.id, reviewId))
        await applyReviewChange(
          tx,
          review.bookId,
          { status: 'approved', rating: review.rating },
          { status: 'unpublished', rating: review.rating },
        )
        const closed = await tx
          .update(reviewReports)
          .set({
            status: 'actioned',
            resolvedBy: moderatorId,
            resolution: reason,
            resolvedAt: decidedAt,
          })
          .where(and(eq(reviewReports.reviewId, reviewId), eq(reviewReports.status, 'open')))
          .returning({ id: reviewReports.id })
        await notify(tx, review.userId, 'review_unpublished', {
          reviewId,
          bookSlug: review.bookSlug,
          bookTitle: review.bookTitle,
          reason,
        })
        await recordAudit(tx, {
          actorId: moderatorId,
          action: 'review.unpublish',
          targetType: 'review',
          targetId: reviewId,
          before: { status: 'approved' },
          after: { status: 'unpublished', reason, closedReports: closed.length },
          ip: request.ip,
        })
        return { review, closedReports: closed.length }
      })

      if (outcome.review.emailReviewDecisions) {
        await sendDecisionEmail(request.log, outcome.review, 'unpublished', reason)
      }
      return { reviewId, status: 'unpublished', closedReports: outcome.closedReports }
    },
  )

  app.get(
    '/mod/stats',
    { preHandler: [moderate], schema: { response: { 200: modStatsSchema } } },
    async (): Promise<ModStats> => {
      if (!db) throw new Error('moderation routes need a database')
      const [pending] = await db
        .select({ total: count(), oldest: min(reviews.submittedAt) })
        .from(reviews)
        .where(eq(reviews.status, 'pending'))
      const [reported] = await db
        .select({ total: count(), oldest: min(reviewReports.createdAt) })
        .from(reviewReports)
        .where(eq(reviewReports.status, 'open'))
      const age = (at: Date | null) =>
        at ? Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000)) : null
      const oldestPending = pending?.oldest ? new Date(pending.oldest) : null
      const oldestReport = reported?.oldest ? new Date(reported.oldest) : null
      return {
        pendingCount: pending?.total ?? 0,
        oldestPendingAt: oldestPending?.toISOString() ?? null,
        oldestPendingAgeSeconds: age(oldestPending),
        openReportCount: reported?.total ?? 0,
        oldestOpenReportAt: oldestReport?.toISOString() ?? null,
        oldestOpenReportAgeSeconds: age(oldestReport),
      }
    },
  )

  // The parent already carries the `/v1` prefix, so pass only the dependencies.
  await app.register(moderationReportRoutes, { env, db, jobs })
}
