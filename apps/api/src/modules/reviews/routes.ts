import { books, editions, helpfulVotes, reviews, reviewVersions, users } from '@reprint/db'
import {
  type BookReviewsQuery,
  type BookReviewsResponse,
  bookReviewsQuerySchema,
  bookReviewsResponseSchema,
  buildPageMeta,
  deleteMyReviewResponseSchema,
  type HelpfulVoteResponse,
  helpfulVoteResponseSchema,
  type MyReview,
  myReviewSchema,
  nextReviewStatus,
  type ReviewStatus,
  reviewIdParamsSchema,
  reviewInputSchema,
  slugParamsSchema,
} from '@reprint/shared'
import { and, asc, count, desc, eq, ne, type SQL, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { HttpProblem } from '../../errors.js'
import { requireAuth, requireVerified } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { publicCacheHook } from '../catalog/public-cache.js'
import { rateLimit } from '../rate-limit/plugin.js'
import { applyReviewChange } from './aggregates.js'

const UNIQUE_VIOLATION = '23505'

/** Ties always fall back to newest, then ID, so pages never repeat or skip a review. */
const REVIEW_ORDER: Record<BookReviewsQuery['sort'], SQL[]> = {
  most_helpful: [desc(reviews.helpfulCount), desc(reviews.submittedAt), desc(reviews.id)],
  newest: [desc(reviews.submittedAt), desc(reviews.id)],
  highest: [desc(reviews.rating), desc(reviews.submittedAt), desc(reviews.id)],
  lowest: [asc(reviews.rating), desc(reviews.submittedAt), desc(reviews.id)],
}

function toMyReview(row: typeof reviews.$inferSelect, rejectionReason: string | null): MyReview {
  return {
    id: row.id,
    rating: row.rating,
    headline: row.headline,
    body: row.body,
    hasSpoilers: row.hasSpoilers,
    editionId: row.editionId,
    status: row.status,
    rejectionReason: row.status === 'rejected' ? rejectionReason : null,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const reviewRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options

  async function bookIdFor(slug: string): Promise<string> {
    if (!db) throw new Error('review routes need a database')
    const [book] = await db.select({ id: books.id }).from(books).where(eq(books.slug, slug))
    if (!book) throw new HttpProblem(404, 'Book not found.')
    return book.id
  }

  // The public list is cached like the catalog's other public GETs (PRD §10).
  const publicReviews: FastifyPluginAsyncZod = async (publicScope) => {
    publicScope.addHook('onSend', publicCacheHook)
    publicScope.get(
      '/books/:slug/reviews',
      {
        schema: {
          params: slugParamsSchema,
          querystring: bookReviewsQuerySchema,
          response: { 200: bookReviewsResponseSchema },
        },
      },
      async (request): Promise<BookReviewsResponse> => {
        if (!db) throw new Error('review routes need a database')
        const { sort, rating, page, pageSize } = request.query
        const bookId = await bookIdFor(request.params.slug)
        // Approved only; reviews of a deleted account are gone from the public view (D-043).
        const where = and(
          eq(reviews.bookId, bookId),
          eq(reviews.status, 'approved'),
          ne(users.status, 'deleted'),
          rating === undefined ? undefined : eq(reviews.rating, rating),
        )
        const [totalRow] = await db
          .select({ total: count() })
          .from(reviews)
          .innerJoin(users, eq(users.id, reviews.userId))
          .where(where)
        const rows = await db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            headline: reviews.headline,
            body: reviews.body,
            hasSpoilers: reviews.hasSpoilers,
            helpfulCount: reviews.helpfulCount,
            submittedAt: reviews.submittedAt,
            username: users.username,
            displayName: users.displayName,
          })
          .from(reviews)
          .innerJoin(users, eq(users.id, reviews.userId))
          .where(where)
          .orderBy(...REVIEW_ORDER[sort])
          .limit(pageSize)
          .offset((page - 1) * pageSize)
        return {
          items: rows.map(({ username, displayName, submittedAt, ...row }) => ({
            ...row,
            submittedAt: submittedAt.toISOString(),
            author: { username, displayName },
          })),
          meta: buildPageMeta({ page, pageSize }, totalRow?.total ?? 0),
        }
      },
    )
  }
  await app.register(publicReviews)

  app.get(
    '/books/:slug/my-review',
    {
      preHandler: [requireAuth],
      schema: { params: slugParamsSchema, response: { 200: myReviewSchema } },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('review routes need a database')
      const bookId = await bookIdFor(request.params.slug)
      const [review] = await db
        .select()
        .from(reviews)
        .where(and(eq(reviews.userId, request.auth.user.id), eq(reviews.bookId, bookId)))
      if (!review) throw new HttpProblem(404, 'You have not reviewed this Book.')
      const [latest] = await db
        .select({ reason: reviewVersions.decisionReason })
        .from(reviewVersions)
        .where(eq(reviewVersions.reviewId, review.id))
        .orderBy(desc(reviewVersions.version))
        .limit(1)
      return toMyReview(review, latest?.reason ?? null)
    },
  )

  app.put(
    '/books/:slug/my-review',
    {
      preHandler: [requireVerified, rateLimit('reviewWrite')],
      schema: {
        params: slugParamsSchema,
        body: reviewInputSchema,
        response: { 200: myReviewSchema, 201: myReviewSchema },
      },
    },
    async (request, reply) => {
      if (!db || !request.auth) throw new Error('review routes need a database')
      const userId = request.auth.user.id
      const input = request.body
      const bookId = await bookIdFor(request.params.slug)
      if (input.editionId) {
        const [edition] = await db
          .select({ id: editions.id })
          .from(editions)
          .where(and(eq(editions.id, input.editionId), eq(editions.bookId, bookId)))
        if (!edition) {
          throw new HttpProblem(400, 'The request did not pass validation.', {
            errors: [{ path: 'body.editionId', message: 'That Edition is not of this Book.' }],
          })
        }
      }
      const content = {
        rating: input.rating,
        headline: input.headline || null,
        body: input.body,
        hasSpoilers: input.hasSpoilers,
        editionId: input.editionId ?? null,
      }

      try {
        const { review, created } = await db.transaction(async (tx) => {
          // Locking the row serializes two edits of one review, so aggregates never double-count.
          const [existing] = await tx
            .select()
            .from(reviews)
            .where(and(eq(reviews.userId, userId), eq(reviews.bookId, bookId)))
            .for('update')
          const from: ReviewStatus | null = existing?.status ?? null
          const to = nextReviewStatus(from, existing ? 'edit' : 'submit')
          if (!to) throw new Error('a Review can always be submitted or edited')

          const now = new Date()
          const values = { ...content, status: to, submittedAt: now, decidedAt: null }
          let saved: typeof reviews.$inferSelect | undefined
          let version = 1
          if (existing) {
            ;[saved] = await tx
              .update(reviews)
              .set({ ...values, updatedAt: now })
              .where(eq(reviews.id, existing.id))
              .returning()
            const [last] = await tx
              .select({ version: reviewVersions.version })
              .from(reviewVersions)
              .where(eq(reviewVersions.reviewId, existing.id))
              .orderBy(desc(reviewVersions.version))
              .limit(1)
            version = (last?.version ?? 0) + 1
          } else {
            ;[saved] = await tx
              .insert(reviews)
              .values({ ...values, userId, bookId })
              .returning()
          }
          if (!saved) throw new Error('failed to save the review')
          await tx
            .insert(reviewVersions)
            .values({ ...content, reviewId: saved.id, version, status: 'pending' })
          await applyReviewChange(
            tx,
            bookId,
            existing ? { status: existing.status, rating: existing.rating } : null,
            { status: saved.status, rating: saved.rating },
          )
          return { review: saved, created: !existing }
        })
        reply.code(created ? 201 : 200)
        return toMyReview(review, null)
      } catch (error) {
        // Two first submissions racing past the lookup: the unique (user, Book) constraint decides.
        if (isUniqueViolation(error)) {
          throw new HttpProblem(409, 'You have already reviewed this Book. Try again to edit it.')
        }
        throw error
      }
    },
  )

  app.delete(
    '/books/:slug/my-review',
    {
      preHandler: [requireAuth],
      schema: { params: slugParamsSchema, response: { 200: deleteMyReviewResponseSchema } },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('review routes need a database')
      const userId = request.auth.user.id
      const bookId = await bookIdFor(request.params.slug)
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(reviews)
          .where(and(eq(reviews.userId, userId), eq(reviews.bookId, bookId)))
          .for('update')
        if (!existing) throw new HttpProblem(404, 'You have not reviewed this Book.')
        await applyReviewChange(
          tx,
          bookId,
          { status: existing.status, rating: existing.rating },
          null,
        )
        // Versions and claims go with it by cascade; deleting is permanent (PRD §7.6).
        await tx.delete(reviews).where(eq(reviews.id, existing.id))
      })
      return { status: 'review_deleted' as const }
    },
  )

  // Helpful votes (PRD §7.6): verified Members, someone else's Approved review, once each.
  app.post(
    '/reviews/:id/helpful',
    {
      preHandler: [requireVerified],
      schema: { params: reviewIdParamsSchema, response: { 200: helpfulVoteResponseSchema } },
    },
    async (request): Promise<HelpfulVoteResponse> => {
      if (!db || !request.auth) throw new Error('review routes need a database')
      const userId = request.auth.user.id
      return db.transaction(async (tx) => {
        const review = await lockVotableReview(tx, request.params.id)
        if (review.userId === userId) {
          throw new HttpProblem(403, 'You cannot mark your own review helpful.')
        }
        const inserted = await tx
          .insert(helpfulVotes)
          .values({ reviewId: review.id, userId })
          .onConflictDoNothing()
          .returning({ reviewId: helpfulVotes.reviewId })
        // Voting twice changes nothing: the count moves only with a new row.
        const helpfulCount =
          inserted.length > 0 ? await bumpHelpful(tx, review.id, 1) : review.helpfulCount
        return { helpful: true, helpfulCount }
      })
    },
  )

  app.delete(
    '/reviews/:id/helpful',
    {
      preHandler: [requireAuth],
      schema: { params: reviewIdParamsSchema, response: { 200: helpfulVoteResponseSchema } },
    },
    async (request): Promise<HelpfulVoteResponse> => {
      if (!db || !request.auth) throw new Error('review routes need a database')
      const userId = request.auth.user.id
      return db.transaction(async (tx) => {
        // Removing a vote stays possible after the review leaves Approved, so counts can't strand.
        const [review] = await tx
          .select({ id: reviews.id, helpfulCount: reviews.helpfulCount })
          .from(reviews)
          .where(eq(reviews.id, request.params.id))
          .for('update')
        if (!review) throw new HttpProblem(404, 'Review not found.')
        const removed = await tx
          .delete(helpfulVotes)
          .where(and(eq(helpfulVotes.reviewId, review.id), eq(helpfulVotes.userId, userId)))
          .returning({ reviewId: helpfulVotes.reviewId })
        const helpfulCount =
          removed.length > 0 ? await bumpHelpful(tx, review.id, -1) : review.helpfulCount
        return { helpful: false, helpfulCount }
      })
    },
  )
}

type Tx = Parameters<Parameters<NonNullable<AuthRoutesOptions['db']>['transaction']>[0]>[0]

/** Locks an Approved review (of a Member who has not deleted their account) for a vote change. */
async function lockVotableReview(tx: Tx, id: string) {
  const [review] = await tx
    .select({
      id: reviews.id,
      userId: reviews.userId,
      status: reviews.status,
      helpfulCount: reviews.helpfulCount,
      authorStatus: users.status,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(eq(reviews.id, id))
    .for('update', { of: reviews })
  // A review that is not public looks the same as one that does not exist.
  if (!review || review.status !== 'approved' || review.authorStatus === 'deleted') {
    throw new HttpProblem(404, 'Review not found.')
  }
  return review
}

async function bumpHelpful(tx: Tx, reviewId: string, delta: 1 | -1): Promise<number> {
  const [row] = await tx
    .update(reviews)
    .set({ helpfulCount: sql`${reviews.helpfulCount} + ${delta}` })
    .where(eq(reviews.id, reviewId))
    .returning({ helpfulCount: reviews.helpfulCount })
  if (!row) throw new Error('failed to update helpful_count')
  return row.helpfulCount
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null) ?? {}
  return code.code === UNIQUE_VIOLATION || code.cause?.code === UNIQUE_VIOLATION
}
