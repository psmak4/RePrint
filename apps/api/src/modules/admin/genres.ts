import { authors, bookGenres, books, editions, genres, subjectGenreRules } from '@reprint/db'
import {
  type AdminCatalogStats,
  type AdminGenre,
  type AdminGenresResponse,
  type AdminSubjectRule,
  type AdminSubjectRulesResponse,
  adminCatalogStatsSchema,
  adminGenreCreateSchema,
  adminGenreEditSchema,
  adminGenreParamsSchema,
  adminGenreSchema,
  adminGenresResponseSchema,
  adminSubjectRuleCreateSchema,
  adminSubjectRuleParamsSchema,
  adminSubjectRuleSchema,
  adminSubjectRulesResponseSchema,
} from '@reprint/shared'
import { asc, count, desc, eq, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import type { Tx } from './books.js'

type GenreRow = typeof genres.$inferSelect

const STATS_MONTHS = 12

function isUniqueViolation(error: unknown): boolean {
  const code = error as { code?: string; cause?: { code?: string } } | null
  return code?.code === '23505' || code?.cause?.code === '23505'
}

async function toAdminGenre(tx: Tx, row: GenreRow): Promise<AdminGenre> {
  const [books_] = await tx
    .select({ n: count() })
    .from(bookGenres)
    .where(eq(bookGenres.genreId, row.id))
  const [rules] = await tx
    .select({ n: count() })
    .from(subjectGenreRules)
    .where(eq(subjectGenreRules.genreId, row.id))
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    featured: row.featured,
    archived: row.archivedAt !== null,
    bookCount: books_?.n ?? 0,
    ruleCount: rules?.n ?? 0,
  }
}

function snapshot(row: GenreRow) {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    archived: row.archivedAt !== null,
  }
}

/** Browsing is two levels deep (PRD §7.5): a parent must be a live root Genre. */
async function checkParent(tx: Tx, parentId: string, selfId: string | null) {
  if (parentId === selfId) throw new HttpProblem(400, 'A Genre cannot be its own parent.')
  const [parent] = await tx.select().from(genres).where(eq(genres.id, parentId))
  if (!parent) throw new HttpProblem(404, 'Parent Genre not found.')
  if (parent.parentId !== null) {
    throw new HttpProblem(
      400,
      'Genres are two levels deep: choose a top-level Genre as the parent.',
    )
  }
  if (parent.archivedAt !== null) throw new HttpProblem(400, 'The parent Genre is archived.')
}

/** Genre list, Subject-to-Genre rules, and Catalog growth stats (PRD §5.4, §6, §7.11, D-158). */
export const adminGenreRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const manage = requirePermission('catalog.manage')

  app.get(
    '/admin/genres',
    { preHandler: [manage], schema: { response: { 200: adminGenresResponseSchema } } },
    async (): Promise<AdminGenresResponse> => {
      if (!db) throw new Error('admin routes need a database')
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(genres).orderBy(asc(genres.name), asc(genres.id))
        return { items: await Promise.all(rows.map((row) => toAdminGenre(tx, row))) }
      })
    },
  )

  app.post(
    '/admin/genres',
    {
      preHandler: [manage],
      schema: { body: adminGenreCreateSchema, response: { 201: adminGenreSchema } },
    },
    async (request, reply): Promise<AdminGenre> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const body = request.body
      try {
        const created = await db.transaction(async (tx) => {
          if (body.parentId) await checkParent(tx, body.parentId, null)
          const [row] = await tx
            .insert(genres)
            .values({
              slug: body.slug,
              name: body.name,
              description: body.description,
              parentId: body.parentId,
            })
            .returning()
          if (!row) throw new Error('genre insert returned nothing')
          await recordAudit(tx, {
            actorId,
            action: 'genre.change',
            targetType: 'genre',
            targetId: row.id,
            after: snapshot(row),
            ip: request.ip,
          })
          return toAdminGenre(tx, row)
        })
        reply.code(201)
        return created
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpProblem(409, 'That slug is already in use.')
        throw error
      }
    },
  )

  app.patch(
    '/admin/genres/:id',
    {
      preHandler: [manage],
      schema: {
        params: adminGenreParamsSchema,
        body: adminGenreEditSchema,
        response: { 200: adminGenreSchema },
      },
    },
    async (request): Promise<AdminGenre> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const body = request.body
      try {
        return await db.transaction(async (tx) => {
          const [before] = await tx
            .select()
            .from(genres)
            .where(eq(genres.id, request.params.id))
            .for('update')
          if (!before) throw new HttpProblem(404, 'Genre not found.')
          const patch: Partial<typeof genres.$inferInsert> = { updatedAt: new Date() }
          if (body.slug !== undefined) patch.slug = body.slug
          if (body.name !== undefined) patch.name = body.name
          if (body.description !== undefined) patch.description = body.description
          if (body.parentId !== undefined) {
            if (body.parentId !== null) {
              await checkParent(tx, body.parentId, before.id)
              const [child] = await tx
                .select({ n: count() })
                .from(genres)
                .where(eq(genres.parentId, before.id))
              if ((child?.n ?? 0) > 0) {
                throw new HttpProblem(400, 'A Genre with child Genres cannot have a parent.')
              }
            }
            patch.parentId = body.parentId
          }
          if (body.archived !== undefined) {
            if (body.archived && before.archivedAt === null) {
              const [live] = await tx
                .select({ n: count() })
                .from(genres)
                .where(sql`${genres.parentId} = ${before.id} and ${genres.archivedAt} is null`)
              if ((live?.n ?? 0) > 0) {
                throw new HttpProblem(409, 'Archive or move the child Genres first.')
              }
              patch.archivedAt = new Date()
            } else if (!body.archived) {
              patch.archivedAt = null
            }
          }
          const [after] = await tx
            .update(genres)
            .set(patch)
            .where(eq(genres.id, before.id))
            .returning()
          if (!after) throw new Error('genre update returned nothing')
          await recordAudit(tx, {
            actorId,
            action: 'genre.change',
            targetType: 'genre',
            targetId: after.id,
            before: snapshot(before),
            after: snapshot(after),
            ip: request.ip,
          })
          return toAdminGenre(tx, after)
        })
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpProblem(409, 'That slug is already in use.')
        throw error
      }
    },
  )

  const ruleRows = (tx: Tx) =>
    tx
      .select({
        id: subjectGenreRules.id,
        pattern: subjectGenreRules.pattern,
        priority: subjectGenreRules.priority,
        genre: { id: genres.id, slug: genres.slug, name: genres.name },
      })
      .from(subjectGenreRules)
      .innerJoin(genres, eq(genres.id, subjectGenreRules.genreId))

  app.get(
    '/admin/subject-rules',
    { preHandler: [manage], schema: { response: { 200: adminSubjectRulesResponseSchema } } },
    async (): Promise<AdminSubjectRulesResponse> => {
      if (!db) throw new Error('admin routes need a database')
      return db.transaction(async (tx) => ({
        items: await ruleRows(tx).orderBy(
          desc(subjectGenreRules.priority),
          asc(genres.name),
          asc(subjectGenreRules.pattern),
          asc(subjectGenreRules.id),
        ),
      }))
    },
  )

  app.post(
    '/admin/subject-rules',
    {
      preHandler: [manage],
      schema: { body: adminSubjectRuleCreateSchema, response: { 201: adminSubjectRuleSchema } },
    },
    async (request, reply): Promise<AdminSubjectRule> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const { pattern, genreId, priority } = request.body
      try {
        const created = await db.transaction(async (tx) => {
          const [genre] = await tx.select().from(genres).where(eq(genres.id, genreId))
          if (!genre) throw new HttpProblem(404, 'Genre not found.')
          if (genre.archivedAt !== null) throw new HttpProblem(400, 'That Genre is archived.')
          const [rule] = await tx
            .insert(subjectGenreRules)
            .values({ pattern, genreId, priority })
            .returning()
          if (!rule) throw new Error('rule insert returned nothing')
          await recordAudit(tx, {
            actorId,
            action: 'subject_rule.change',
            targetType: 'subject_rule',
            targetId: rule.id,
            after: { pattern, genreId, priority },
            ip: request.ip,
          })
          const [row] = await ruleRows(tx).where(eq(subjectGenreRules.id, rule.id))
          if (!row) throw new Error('rule vanished')
          return row
        })
        reply.code(201)
        return created
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpProblem(409, 'That pattern already maps to that Genre.')
        }
        throw error
      }
    },
  )

  app.delete(
    '/admin/subject-rules/:id',
    {
      preHandler: [manage],
      schema: {
        params: adminSubjectRuleParamsSchema,
        response: { 200: z.object({ removed: z.literal(true) }) },
      },
    },
    async (request) => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      return db.transaction(async (tx) => {
        const [rule] = await tx
          .delete(subjectGenreRules)
          .where(eq(subjectGenreRules.id, request.params.id))
          .returning()
        if (!rule) throw new HttpProblem(404, 'Rule not found.')
        await recordAudit(tx, {
          actorId,
          action: 'subject_rule.change',
          targetType: 'subject_rule',
          targetId: rule.id,
          before: { pattern: rule.pattern, genreId: rule.genreId, priority: rule.priority },
          ip: request.ip,
        })
        return { removed: true as const }
      })
    },
  )

  app.get(
    '/admin/catalog/stats',
    { preHandler: [manage], schema: { response: { 200: adminCatalogStatsSchema } } },
    async (): Promise<AdminCatalogStats> => {
      if (!db) throw new Error('admin routes need a database')
      return db.transaction(async (tx) => {
        const [b] = await tx.select({ n: count() }).from(books)
        const [e] = await tx.select({ n: count() }).from(editions)
        const [a] = await tx.select({ n: count() }).from(authors)
        const grown = await tx.execute<{
          month: string
          books: number
          editions: number
          authors: number
        }>(sql`
          with months as (
            select to_char(m, 'YYYY-MM') as month, m as start
            from generate_series(
              date_trunc('month', now() at time zone 'utc') - make_interval(months => ${STATS_MONTHS - 1}),
              date_trunc('month', now() at time zone 'utc'),
              interval '1 month') as m)
          select months.month,
            (select count(*)::int from books x
              where date_trunc('month', x.created_at at time zone 'utc') = months.start) as books,
            (select count(*)::int from editions x
              where date_trunc('month', x.created_at at time zone 'utc') = months.start) as editions,
            (select count(*)::int from authors x
              where date_trunc('month', x.created_at at time zone 'utc') = months.start) as authors
          from months order by months.start`)
        return {
          totals: { books: b?.n ?? 0, editions: e?.n ?? 0, authors: a?.n ?? 0 },
          monthly: grown.map((row) => ({
            month: row.month,
            books: row.books,
            editions: row.editions,
            authors: row.authors,
          })),
        }
      })
    },
  )
}
