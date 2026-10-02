import {
  authors,
  bookGenres,
  bookSeries,
  books,
  contributions,
  type Database,
  genres,
  newId,
  series,
} from '@reprint/db'
import {
  type AdminBook,
  type AdminBookEdit,
  adminBookEditSchema,
  adminBookParamsSchema,
  adminBookSchema,
  type FieldOrigins,
  makeSlug,
} from '@reprint/shared'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ADMIN_ORIGIN } from '../../catalog/ingest/fields.js'
import { refreshSearchVector } from '../../catalog/ingest/ingest.js'
import { HttpProblem } from '../../errors.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

function invalid(path: string, message: string): HttpProblem {
  return new HttpProblem(400, 'The request did not pass validation.', {
    errors: [{ path, message }],
  })
}

/** The Book as an Admin sees it: editable fields, and which fields are locked. */
async function loadBook(tx: Tx, id: string, lock = false): Promise<AdminBook | null> {
  const query = tx.select().from(books).where(eq(books.id, id))
  const [book] = await (lock ? query.for('update') : query)
  if (!book) return null
  const [genreRows, seriesRows, contributionRows] = await Promise.all([
    tx
      .select({ id: genres.id, slug: genres.slug, name: genres.name })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(eq(bookGenres.bookId, id))
      .orderBy(asc(genres.name)),
    tx
      .select({
        id: series.id,
        slug: series.slug,
        name: series.name,
        position: bookSeries.position,
      })
      .from(bookSeries)
      .innerJoin(series, eq(series.id, bookSeries.seriesId))
      .where(eq(bookSeries.bookId, id))
      .orderBy(asc(series.name)),
    tx
      .select({
        authorId: authors.id,
        name: authors.name,
        role: contributions.role,
        position: contributions.position,
      })
      .from(contributions)
      .innerJoin(authors, eq(authors.id, contributions.authorId))
      .where(eq(contributions.bookId, id))
      .orderBy(asc(contributions.position), asc(authors.name)),
  ])
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description,
    genres: genreRows,
    series: seriesRows,
    contributions: contributionRows,
    lockedFields: book.lockedFields,
    fieldOrigins: book.fieldOrigins as FieldOrigins,
  }
}

/** The editable part of the Book, as written into the audit row. */
function editable(book: AdminBook, fields: readonly string[]): Record<string, unknown> {
  const view: Record<string, unknown> = {
    title: book.title,
    description: book.description,
    genres: book.genres.map((genre) => genre.slug),
    series: book.series.map(({ name, position }) => ({ name, position })),
    contributions: book.contributions.map(({ name, role }) => ({ name, role })),
  }
  return Object.fromEntries(fields.map((field) => [field, view[field]]))
}

async function replaceGenres(tx: Tx, bookId: string, genreIds: string[]) {
  const unique = [...new Set(genreIds)]
  if (unique.length > 0) {
    const found = await tx.select({ id: genres.id }).from(genres).where(inArray(genres.id, unique))
    if (found.length !== unique.length) throw invalid('body.genreIds', 'Unknown Genre.')
  }
  await tx.delete(bookGenres).where(eq(bookGenres.bookId, bookId))
  if (unique.length > 0) {
    await tx
      .insert(bookGenres)
      .values(unique.map((genreId) => ({ bookId, genreId, origin: 'admin' as const })))
  }
}

async function replaceSeries(
  tx: Tx,
  bookId: string,
  memberships: AdminBookEdit['series'],
  at: Date,
) {
  const list = memberships ?? []
  const keys = list.map((m) => m.name.toLowerCase())
  if (new Set(keys).size !== keys.length) throw invalid('body.series', 'Name each Series once.')
  await tx.delete(bookSeries).where(eq(bookSeries.bookId, bookId))
  for (const membership of list) {
    const [existing] = await tx
      .select({ id: series.id })
      .from(series)
      .where(sql`lower(${series.name}) = lower(${membership.name})`)
      .limit(1)
    let seriesId = existing?.id
    if (!seriesId) {
      seriesId = newId()
      await tx.insert(series).values({
        id: seriesId,
        slug: makeSlug(membership.name, seriesId),
        name: membership.name,
        fieldOrigins: { name: { source: ADMIN_ORIGIN, at: at.toISOString() } },
      })
    }
    await tx.insert(bookSeries).values({ bookId, seriesId, position: membership.position })
  }
}

async function replaceContributions(
  tx: Tx,
  bookId: string,
  list: NonNullable<AdminBookEdit['contributions']>,
  at: Date,
) {
  const knownIds = list.flatMap((item) => (item.authorId ? [item.authorId] : []))
  const found = knownIds.length
    ? await tx.select({ id: authors.id }).from(authors).where(inArray(authors.id, knownIds))
    : []
  const foundIds = new Set(found.map((row) => row.id))
  const rows: { authorId: string; role: (typeof list)[number]['role']; position: number }[] = []
  const seen = new Set<string>()
  for (const [index, item] of list.entries()) {
    let authorId = item.authorId
    if (authorId) {
      if (!foundIds.has(authorId)) throw invalid(`body.contributions.${index}`, 'Unknown Author.')
    } else if (item.name) {
      authorId = newId()
      await tx.insert(authors).values({
        id: authorId,
        slug: makeSlug(item.name, authorId),
        name: item.name,
        fieldOrigins: { name: { source: ADMIN_ORIGIN, at: at.toISOString() } },
      })
    }
    if (!authorId) continue
    const key = `${authorId}:${item.role}`
    if (seen.has(key)) {
      throw invalid(`body.contributions.${index}`, 'Credit an Author once per Role.')
    }
    seen.add(key)
    rows.push({ authorId, role: item.role, position: index })
  }
  await tx.delete(contributions).where(eq(contributions.bookId, bookId))
  await tx.insert(contributions).values(rows.map((row) => ({ bookId, ...row })))
}

/** Admin Catalog editing (PRD §5.2, §5.4, §7.11, D-155). */
export const adminBookRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { db } = options
  const manage = requirePermission('catalog.manage')

  app.patch(
    '/admin/books/:id',
    {
      preHandler: [manage],
      schema: {
        params: adminBookParamsSchema,
        body: adminBookEditSchema,
        response: { 200: adminBookSchema },
      },
    },
    async (request): Promise<AdminBook> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const edit = request.body
      const now = new Date()
      const fields = (['title', 'description', 'genreIds', 'series', 'contributions'] as const)
        .filter((field) => edit[field] !== undefined)
        .map((field) => (field === 'genreIds' ? 'genres' : field))

      return db.transaction(async (tx) => {
        const before = await loadBook(tx, request.params.id, true)
        if (!before) throw new HttpProblem(404, 'Book not found.')

        if (edit.genreIds !== undefined) await replaceGenres(tx, before.id, edit.genreIds)
        if (edit.series !== undefined) await replaceSeries(tx, before.id, edit.series, now)
        if (edit.contributions !== undefined) {
          await replaceContributions(tx, before.id, edit.contributions, now)
        }

        // An edited field is set by `admin`, so it is locked and a refresh leaves it alone (PRD §5.2).
        const origins: FieldOrigins = { ...before.fieldOrigins }
        for (const field of fields) origins[field] = { source: ADMIN_ORIGIN, at: now.toISOString() }
        await tx
          .update(books)
          .set({
            ...(edit.title !== undefined ? { title: edit.title } : {}),
            ...(edit.description !== undefined ? { description: edit.description } : {}),
            fieldOrigins: origins,
            lockedFields: [...new Set([...before.lockedFields, ...fields])],
          })
          .where(eq(books.id, before.id))
        await refreshSearchVector(tx, before.id)

        const after = await loadBook(tx, before.id)
        if (!after) throw new Error('book vanished during its edit')
        await recordAudit(tx, {
          actorId,
          action: 'book.edit',
          targetType: 'book',
          targetId: before.id,
          before: editable(before, fields),
          after: editable(after, fields),
          ip: request.ip,
        })
        return after
      })
    },
  )
}
