import {
  books,
  covers,
  helpfulVotes,
  notifications,
  reviewReports,
  reviews,
  reviewVersions,
  sessions,
  shelfEntries,
  users,
} from '@reprint/db'
import { type MemberExport, memberExportSchema } from '@reprint/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import type { ImageStorage } from '../../storage/index.js'
import { requireAuth } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

const iso = (date: Date) => date.toISOString()
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null)

export interface ExportRoutesOptions extends AuthRoutesOptions {
  storage: ImageStorage
}

/** `GET /me/export`: every row keyed to the signed-in Member, as a JSON download (PRD §11). */
export const exportRoutes: FastifyPluginAsyncZod<ExportRoutesOptions> = async (app, options) => {
  const { db, storage } = options

  app.get(
    '/me/export',
    { preHandler: [requireAuth], schema: { response: { 200: memberExportSchema } } },
    async (request, reply): Promise<MemberExport> => {
      if (!db || !request.auth) throw new Error('export routes need a database')
      const userId = request.auth.user.id

      const [account] = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          emailVerifiedAt: users.emailVerifiedAt,
          libraryPublic: users.libraryPublic,
          emailReviewDecisions: users.emailReviewDecisions,
          createdAt: users.createdAt,
          avatarKey: covers.r2Key,
        })
        .from(users)
        .leftJoin(covers, eq(covers.id, users.avatarId))
        .where(eq(users.id, userId))
      if (!account) throw new HttpProblem(401, 'Sign in to continue.')

      const [reviewRows, voteRows, reportRows, shelfRows, notificationRows, sessionRows] =
        await Promise.all([
          db
            .select({
              id: reviews.id,
              slug: books.slug,
              title: books.title,
              rating: reviews.rating,
              headline: reviews.headline,
              body: reviews.body,
              hasSpoilers: reviews.hasSpoilers,
              status: reviews.status,
              helpfulCount: reviews.helpfulCount,
              submittedAt: reviews.submittedAt,
              decidedAt: reviews.decidedAt,
            })
            .from(reviews)
            .innerJoin(books, eq(books.id, reviews.bookId))
            .where(eq(reviews.userId, userId))
            .orderBy(asc(reviews.submittedAt), asc(reviews.id)),
          db
            .select({
              reviewId: helpfulVotes.reviewId,
              slug: books.slug,
              title: books.title,
              createdAt: helpfulVotes.createdAt,
            })
            .from(helpfulVotes)
            .innerJoin(reviews, eq(reviews.id, helpfulVotes.reviewId))
            .innerJoin(books, eq(books.id, reviews.bookId))
            .where(eq(helpfulVotes.userId, userId))
            .orderBy(asc(helpfulVotes.createdAt), asc(helpfulVotes.reviewId)),
          db
            .select({
              id: reviewReports.id,
              reviewId: reviewReports.reviewId,
              slug: books.slug,
              title: books.title,
              reason: reviewReports.reason,
              note: reviewReports.note,
              status: reviewReports.status,
              createdAt: reviewReports.createdAt,
            })
            .from(reviewReports)
            .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
            .innerJoin(books, eq(books.id, reviews.bookId))
            .where(eq(reviewReports.reporterId, userId))
            .orderBy(asc(reviewReports.createdAt), asc(reviewReports.id)),
          db
            .select({
              slug: books.slug,
              title: books.title,
              shelf: shelfEntries.shelf,
              addedAt: shelfEntries.addedAt,
              updatedAt: shelfEntries.updatedAt,
            })
            .from(shelfEntries)
            .innerJoin(books, eq(books.id, shelfEntries.bookId))
            .where(eq(shelfEntries.userId, userId))
            .orderBy(asc(shelfEntries.addedAt), asc(shelfEntries.id)),
          db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(asc(notifications.createdAt), asc(notifications.id)),
          // Token hashes stay out: they authenticate the session.
          db
            .select({
              id: sessions.id,
              ip: sessions.ip,
              userAgent: sessions.userAgent,
              createdAt: sessions.createdAt,
              lastSeenAt: sessions.lastSeenAt,
              expiresAt: sessions.expiresAt,
            })
            .from(sessions)
            .where(eq(sessions.userId, userId))
            .orderBy(asc(sessions.createdAt), asc(sessions.id)),
        ])

      const versionRows =
        reviewRows.length === 0
          ? []
          : await db
              .select({
                reviewId: reviewVersions.reviewId,
                version: reviewVersions.version,
                rating: reviewVersions.rating,
                headline: reviewVersions.headline,
                body: reviewVersions.body,
                hasSpoilers: reviewVersions.hasSpoilers,
                status: reviewVersions.status,
                decisionReason: reviewVersions.decisionReason,
                decidedAt: reviewVersions.decidedAt,
                createdAt: reviewVersions.createdAt,
              })
              .from(reviewVersions)
              .where(
                inArray(
                  reviewVersions.reviewId,
                  reviewRows.map((row) => row.id),
                ),
              )
              .orderBy(asc(reviewVersions.version))

      const body: MemberExport = {
        exportedAt: new Date().toISOString(),
        account: {
          id: account.id,
          email: account.email,
          username: account.username,
          verified: account.emailVerifiedAt !== null,
          emailReviewDecisions: account.emailReviewDecisions,
          createdAt: iso(account.createdAt),
        },
        profile: {
          displayName: account.displayName,
          bio: account.bio,
          avatarUrl: account.avatarKey ? storage.url(account.avatarKey) : null,
          libraryPublic: account.libraryPublic,
        },
        reviews: reviewRows.map((row) => ({
          id: row.id,
          book: { slug: row.slug, title: row.title },
          rating: row.rating,
          headline: row.headline,
          body: row.body,
          hasSpoilers: row.hasSpoilers,
          status: row.status,
          helpfulCount: row.helpfulCount,
          submittedAt: iso(row.submittedAt),
          decidedAt: isoOrNull(row.decidedAt),
          versions: versionRows
            .filter((version) => version.reviewId === row.id)
            .map(({ reviewId: _reviewId, decidedAt, createdAt, ...version }) => ({
              ...version,
              decidedAt: isoOrNull(decidedAt),
              createdAt: iso(createdAt),
            })),
        })),
        helpfulVotes: voteRows.map((row) => ({
          reviewId: row.reviewId,
          book: { slug: row.slug, title: row.title },
          createdAt: iso(row.createdAt),
        })),
        reports: reportRows.map((row) => ({
          id: row.id,
          reviewId: row.reviewId,
          book: { slug: row.slug, title: row.title },
          reason: row.reason,
          note: row.note,
          status: row.status,
          createdAt: iso(row.createdAt),
        })),
        library: shelfRows.map((row) => ({
          book: { slug: row.slug, title: row.title },
          shelf: row.shelf,
          addedAt: iso(row.addedAt),
          updatedAt: iso(row.updatedAt),
        })),
        notifications: notificationRows.map((row) => ({
          id: row.id,
          type: row.type,
          data: row.data as Record<string, unknown>,
          readAt: isoOrNull(row.readAt),
          createdAt: iso(row.createdAt),
        })),
        sessions: sessionRows.map((row) => ({
          id: row.id,
          ip: row.ip,
          userAgent: row.userAgent,
          createdAt: iso(row.createdAt),
          lastSeenAt: iso(row.lastSeenAt),
          expiresAt: iso(row.expiresAt),
        })),
      }

      reply.header('cache-control', 'no-store')
      reply.header(
        'content-disposition',
        `attachment; filename="reprint-${account.username}-data.json"`,
      )
      return body
    },
  )
}
