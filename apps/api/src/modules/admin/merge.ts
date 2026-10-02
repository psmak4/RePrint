import { authors, books, contributions, covers, mergeCandidates } from '@reprint/db'
import {
  type AdminBookMergeResponse,
  type AdminMergeBook,
  type AdminMergeCandidatesResponse,
  adminBookMergeResponseSchema,
  adminBookMergeSchema,
  adminMergeCandidateDismissResponseSchema,
  adminMergeCandidateParamsSchema,
  adminMergeCandidatesQuerySchema,
  adminMergeCandidatesResponseSchema,
} from '@reprint/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { refreshSearchVector } from '../../catalog/ingest/ingest.js'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { toCover } from '../catalog/read.js'
import { decodeCursor, encodeCursor } from '../moderation/cursor.js'
import { loadBook, type Tx } from './books.js'

interface CountRow extends Record<string, unknown> {
  count: number
}

/** The number of rows a statement run through `tx.execute` touched. */
function changed(result: { count?: number | null }): number {
  return result.count ?? 0
}

/** The Books of a page of candidates, with what an Admin needs to choose which one stays. */
async function summarize(tx: Tx, ids: string[]): Promise<Map<string, AdminMergeBook>> {
  const map = new Map<string, AdminMergeBook>()
  if (ids.length === 0) return map
  const rows = await tx.select().from(books).where(inArray(books.id, ids))
  const coverIds = rows.flatMap((row) => (row.coverId ? [row.coverId] : []))
  const coverRows = coverIds.length
    ? await tx.select().from(covers).where(inArray(covers.id, coverIds))
    : []
  const list = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const [authorRows, editionCounts, shelfCounts] = await Promise.all([
    tx
      .select({ bookId: contributions.bookId, name: authors.name })
      .from(contributions)
      .innerJoin(authors, eq(authors.id, contributions.authorId))
      .where(and(inArray(contributions.bookId, ids), eq(contributions.role, 'author')))
      .orderBy(asc(contributions.position), asc(authors.name)),
    tx.execute<{ book_id: string; count: number }>(
      sql`select book_id, count(*)::int as count from editions where book_id in (${list}) group by book_id`,
    ),
    tx.execute<{ book_id: string; count: number }>(
      sql`select book_id, count(*)::int as count from shelf_entries where book_id in (${list}) group by book_id`,
    ),
  ])
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      authors: authorRows.filter((a) => a.bookId === row.id).map((a) => a.name),
      editionCount: editionCounts.find((c) => c.book_id === row.id)?.count ?? 0,
      reviewCount: row.reviewCount,
      shelfEntryCount: shelfCounts.find((c) => c.book_id === row.id)?.count ?? 0,
      cover: toCover(coverRows.find((cover) => cover.id === row.coverId)),
    })
  }
  return map
}

/**
 * Moves everything a Book owns to another Book, then removes it (PRD §5.4, §7.11, D-157). Runs in the
 * caller's transaction; it throws a 409 before changing anything when a Member reviewed both Books.
 */
async function mergeBooks(tx: Tx, fromId: string, intoId: string) {
  // Lock both rows in a fixed order so two merges touching the same Books cannot deadlock.
  const locked = await tx
    .select({ id: books.id })
    .from(books)
    .where(inArray(books.id, [fromId, intoId]))
    .orderBy(asc(books.id))
    .for('update')
  if (locked.length !== 2) throw new HttpProblem(404, 'Book not found.')

  const clash = await tx.execute<CountRow>(sql`
    select count(*)::int as count from reviews a
    join reviews b on b.user_id = a.user_id
    where a.book_id = ${fromId} and b.book_id = ${intoId}`)
  if ((clash[0]?.count ?? 0) > 0) {
    throw new HttpProblem(
      409,
      'These Books cannot be merged: a Member has reviewed both. Reject or remove one of the reviews first.',
    )
  }

  const [from] = await tx.select().from(books).where(eq(books.id, fromId))
  if (!from) throw new HttpProblem(404, 'Book not found.')

  const reviewsMoved = changed(
    await tx.execute(sql`update reviews set book_id = ${intoId} where book_id = ${fromId}`),
  )
  const editionsMoved = changed(
    await tx.execute(sql`update editions set book_id = ${intoId} where book_id = ${fromId}`),
  )
  await tx.execute(sql`
    update source_links set entity_id = ${intoId}
    where entity_type = 'book' and entity_id = ${fromId}`)
  const shelfEntriesMoved = changed(
    await tx.execute(sql`
      update shelf_entries set book_id = ${intoId}
      where book_id = ${fromId}
        and user_id not in (select user_id from shelf_entries where book_id = ${intoId})`),
  )
  // Rows the remaining Book already has stay as they are; the rest are copied over.
  await tx.execute(sql`
    insert into contributions (book_id, author_id, role, position)
    select ${intoId}, author_id, role, position from contributions where book_id = ${fromId}
    on conflict do nothing`)
  await tx.execute(sql`
    insert into book_genres (book_id, genre_id, origin)
    select ${intoId}, genre_id, origin from book_genres where book_id = ${fromId}
    on conflict (book_id, genre_id) do update
      set origin = case when excluded.origin = 'admin' then 'admin' else book_genres.origin end`)
  await tx.execute(sql`
    insert into book_series (book_id, series_id, position)
    select ${intoId}, series_id, position from book_series where book_id = ${fromId}
    on conflict do nothing`)
  await tx.execute(sql`
    insert into book_subjects (book_id, subject_id)
    select ${intoId}, subject_id from book_subjects where book_id = ${fromId}
    on conflict do nothing`)
  // The remaining Book keeps its own fields; it only fills what it lacks.
  await tx.execute(sql`
    update books set
      description = coalesce(description, ${from.description}),
      cover_id = coalesce(cover_id, ${from.coverId}::uuid),
      primary_edition_id = coalesce(primary_edition_id, ${from.primaryEditionId}::uuid)
    where id = ${intoId}`)

  // Candidates that named the removed Book now name the remaining one (the pair itself disappears).
  await tx.execute(sql`
    insert into merge_candidates (id, book_a_id, book_b_id, reason)
    select uuidv7(),
      case when c.book_a_id = ${fromId} then ${intoId}::uuid else c.book_a_id end,
      case when c.book_b_id = ${fromId} then ${intoId}::uuid else c.book_b_id end,
      c.reason
    from merge_candidates c
    where c.status = 'pending'
      and (c.book_a_id = ${fromId} or c.book_b_id = ${fromId})
      and not (c.book_a_id in (${fromId}, ${intoId}) and c.book_b_id in (${fromId}, ${intoId}))
    on conflict do nothing`)

  // Old links to either slug find the remaining Book.
  await tx.execute(
    sql`update book_slug_redirects set book_id = ${intoId} where book_id = ${fromId}`,
  )
  await tx.execute(
    sql`insert into book_slug_redirects (slug, book_id) values (${from.slug}, ${intoId})`,
  )

  await tx.delete(books).where(eq(books.id, fromId))

  // The totals are recounted from the Approved reviews now on the Book, in this transaction (PRD §9).
  await tx.execute(sql`
    update books b set
      review_count = coalesce(t.review_count, 0),
      rating_sum = coalesce(t.rating_sum, 0),
      rating_counts = coalesce(t.rating_counts, array[0, 0, 0, 0, 0])
    from (select ${intoId}::uuid as id) k
    left join (
      select r.book_id,
        count(*)::int as review_count,
        sum(r.rating)::int as rating_sum,
        array[
          count(*) filter (where r.rating = 1)::int,
          count(*) filter (where r.rating = 2)::int,
          count(*) filter (where r.rating = 3)::int,
          count(*) filter (where r.rating = 4)::int,
          count(*) filter (where r.rating = 5)::int
        ] as rating_counts
      from reviews r join users u on u.id = r.user_id
      where r.book_id = ${intoId} and r.status = 'approved' and u.status <> 'deleted'
      group by r.book_id
    ) t on t.book_id = k.id
    where b.id = k.id`)
  await refreshSearchVector(tx, intoId)

  return {
    from: { id: from.id, slug: from.slug, title: from.title },
    moved: { reviews: reviewsMoved, shelfEntries: shelfEntriesMoved, editions: editionsMoved },
  }
}

/** The merge queue and merging duplicate Books (PRD §5.4, §7.11, D-157). Needs `catalog.manage`. */
export const adminMergeRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const manage = requirePermission('catalog.manage')

  app.get(
    '/admin/books/merge-candidates',
    {
      preHandler: [manage],
      schema: {
        querystring: adminMergeCandidatesQuerySchema,
        response: { 200: adminMergeCandidatesResponseSchema },
      },
    },
    async (request): Promise<AdminMergeCandidatesResponse> => {
      if (!db) throw new Error('admin routes need a database')
      const { cursor, limit } = request.query
      const after = cursor ? decodeCursor(cursor) : null
      return db.transaction(async (tx) => {
        const rows = await tx
          .select({
            candidate: mergeCandidates,
            createdAtText: sql<string>`${mergeCandidates.createdAt}::text`,
          })
          .from(mergeCandidates)
          .where(
            and(
              eq(mergeCandidates.status, 'pending'),
              after
                ? sql`(${mergeCandidates.createdAt}, ${mergeCandidates.id}) > (${after.at}::timestamptz, ${after.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(asc(mergeCandidates.createdAt), asc(mergeCandidates.id))
          .limit(limit + 1)
        const page = rows.slice(0, limit)
        const last = page.at(-1)
        const summaries = await summarize(
          tx,
          page.flatMap(({ candidate }) => [candidate.bookAId, candidate.bookBId]),
        )
        const items = page.flatMap(({ candidate }) => {
          const bookA = summaries.get(candidate.bookAId)
          const bookB = summaries.get(candidate.bookBId)
          if (!bookA || !bookB) return []
          return [
            {
              id: candidate.id,
              reason: candidate.reason,
              createdAt: candidate.createdAt.toISOString(),
              bookA,
              bookB,
            },
          ]
        })
        return {
          items,
          meta: {
            nextCursor:
              rows.length > limit && last
                ? encodeCursor(last.createdAtText, last.candidate.id)
                : null,
          },
        }
      })
    },
  )

  app.post(
    '/admin/books/merge-candidates/:id/dismiss',
    {
      preHandler: [manage],
      schema: {
        params: adminMergeCandidateParamsSchema,
        response: { 200: adminMergeCandidateDismissResponseSchema },
      },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select()
          .from(mergeCandidates)
          .where(eq(mergeCandidates.id, request.params.id))
          .for('update')
        if (!candidate) throw new HttpProblem(404, 'Merge candidate not found.')
        if (candidate.status !== 'pending') {
          throw new HttpProblem(409, 'That candidate has already been decided.')
        }
        await tx
          .update(mergeCandidates)
          .set({ status: 'dismissed', updatedAt: new Date() })
          .where(eq(mergeCandidates.id, candidate.id))
        await recordAudit(tx, {
          actorId,
          action: 'merge.dismiss',
          targetType: 'merge_candidate',
          targetId: candidate.id,
          before: { status: 'pending', bookAId: candidate.bookAId, bookBId: candidate.bookBId },
          after: { status: 'dismissed' },
          ip: request.ip,
        })
        return { status: 'dismissed' as const }
      })
    },
  )

  app.post(
    '/admin/books/merge',
    {
      preHandler: [manage],
      schema: { body: adminBookMergeSchema, response: { 200: adminBookMergeResponseSchema } },
    },
    async (request): Promise<AdminBookMergeResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { fromBookId, intoBookId } = request.body
      return db.transaction(async (tx) => {
        const result = await mergeBooks(tx, fromBookId, intoBookId)
        const book = await loadBook(tx, intoBookId)
        if (!book) throw new Error('book vanished during its merge')
        await recordAudit(tx, {
          actorId,
          action: 'book.merge',
          targetType: 'book',
          targetId: intoBookId,
          before: { mergedBook: result.from },
          after: { slug: book.slug, moved: result.moved },
          ip: request.ip,
        })
        return { book, moved: result.moved }
      })
    },
  )
}
