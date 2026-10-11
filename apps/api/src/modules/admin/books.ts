import multipart from '@fastify/multipart'
import {
  authors,
  bookGenres,
  bookSeries,
  books,
  contributions,
  covers,
  type Database,
  editions,
  genres,
  newId,
  series,
} from '@reprint/db'
import {
  ADMIN_BOOK_SEARCH_PAGE_SIZE,
  type AdminBook,
  type AdminBookDetail,
  type AdminBookEdit,
  type AdminBookRefreshResponse,
  type AdminBookSearchResponse,
  adminBookCoverResponseSchema,
  adminBookDetailSchema,
  adminBookEditSchema,
  adminBookParamsSchema,
  adminBookRefreshResponseSchema,
  adminBookSchema,
  adminBookSearchQuerySchema,
  adminBookSearchResponseSchema,
  type FieldOrigins,
  makeSlug,
} from '@reprint/shared'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { ADMIN_ORIGIN } from '../../catalog/ingest/fields.js'
import { refreshSearchVector } from '../../catalog/ingest/ingest.js'
import { searchCatalogBooks } from '../../catalog/search/catalog-search.js'
import { HttpProblem } from '../../errors.js'
import type { ImageStorage } from '../../storage/index.js'
import { recordAudit } from '../audit/audit.js'
import { requirePermission } from '../auth/guards.js'
import type { AuthRoutesOptions } from '../auth/register.js'
import { loadBookSummaries, toCover } from '../catalog/read.js'
import { InvalidImageError } from '../me/avatar-image.js'
import { processBookCover } from './cover-image.js'

export interface AdminBookRoutesOptions extends AuthRoutesOptions {
  storage: ImageStorage
}

/** An Admin's refresh goes ahead of the background refreshes queued by page views (priority 10). */
const ADMIN_REFRESH_PRIORITY = 1

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

function invalid(path: string, message: string): HttpProblem {
  return new HttpProblem(400, 'The request did not pass validation.', {
    errors: [{ path, message }],
  })
}

/** The Book as an Admin sees it: editable fields, and which fields are locked. */
export async function loadBook(tx: Tx, id: string, lock = false): Promise<AdminBook | null> {
  const query = tx.select().from(books).where(eq(books.id, id))
  const [book] = await (lock ? query.for('update') : query)
  if (!book) return null
  const [genreRows, seriesRows, contributionRows, coverRows] = await Promise.all([
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
    book.coverId
      ? tx.select().from(covers).where(eq(covers.id, book.coverId))
      : Promise.resolve([]),
  ])
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description,
    genres: genreRows,
    series: seriesRows,
    contributions: contributionRows,
    cover: toCover(coverRows[0]),
    primaryEditionId: book.primaryEditionId,
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
    primaryEdition: book.primaryEditionId,
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
export const adminBookRoutes: FastifyPluginAsyncZod<AdminBookRoutesOptions> = async (
  app,
  options,
) => {
  const { env, db, storage, jobs } = options
  const manage = requirePermission('catalog.manage')
  await app.register(multipart, { limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fields: 0 } })

  // Finds a Book to edit: the public search's matching over the Catalog alone, never a Source.
  app.get(
    '/admin/books',
    {
      preHandler: [manage],
      schema: {
        querystring: adminBookSearchQuerySchema,
        response: { 200: adminBookSearchResponseSchema },
      },
    },
    async (request): Promise<AdminBookSearchResponse> => {
      if (!db) throw new Error('admin routes need a database')
      const { q, page } = request.query
      const hits = await searchCatalogBooks(db, {
        q,
        // One extra hit says whether there is another page.
        limit: ADMIN_BOOK_SEARCH_PAGE_SIZE + 1,
        offset: (page - 1) * ADMIN_BOOK_SEARCH_PAGE_SIZE,
      })
      const shown = hits.slice(0, ADMIN_BOOK_SEARCH_PAGE_SIZE)
      const items = await loadBookSummaries(
        db,
        shown.map((hit) => hit.id),
      )
      return { items, page, hasMore: hits.length > ADMIN_BOOK_SEARCH_PAGE_SIZE }
    },
  )

  app.get(
    '/admin/books/:id',
    {
      preHandler: [manage],
      schema: { params: adminBookParamsSchema, response: { 200: adminBookDetailSchema } },
    },
    async (request): Promise<AdminBookDetail> => {
      if (!db) throw new Error('admin routes need a database')
      const book = await db.transaction((tx) => loadBook(tx, request.params.id))
      if (!book) throw new HttpProblem(404, 'Book not found.')
      const editionRows = await db
        .select({
          id: editions.id,
          isbn13: editions.isbn13,
          format: editions.format,
          language: editions.language,
          publisherName: editions.publisherName,
          publishedDate: editions.publishedDate,
        })
        .from(editions)
        .where(eq(editions.bookId, book.id))
        .orderBy(asc(editions.publishedDate), asc(editions.id))
      return { ...book, editions: editionRows }
    },
  )
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
      const fields = (
        ['title', 'description', 'genreIds', 'series', 'contributions', 'primaryEditionId'] as const
      )
        .filter((field) => edit[field] !== undefined)
        .map((field) =>
          field === 'genreIds' ? 'genres' : field === 'primaryEditionId' ? 'primaryEdition' : field,
        )

      const onlyPrimaryEdition = fields.length === 1 && fields[0] === 'primaryEdition'

      return db.transaction(async (tx) => {
        const before = await loadBook(tx, request.params.id, true)
        if (!before) throw new HttpProblem(404, 'Book not found.')

        if (edit.genreIds !== undefined) await replaceGenres(tx, before.id, edit.genreIds)
        if (edit.series !== undefined) await replaceSeries(tx, before.id, edit.series, now)
        if (edit.contributions !== undefined) {
          await replaceContributions(tx, before.id, edit.contributions, now)
        }
        if (edit.primaryEditionId !== undefined) {
          const [edition] = await tx
            .select({ id: editions.id })
            .from(editions)
            .where(and(eq(editions.id, edit.primaryEditionId), eq(editions.bookId, before.id)))
          if (!edition)
            throw invalid('body.primaryEditionId', 'Choose one of this Book’s Editions.')
        }

        // An edited field is set by `admin`, so it is locked and a refresh leaves it alone (PRD §5.2).
        const origins: FieldOrigins = { ...before.fieldOrigins }
        for (const field of fields) origins[field] = { source: ADMIN_ORIGIN, at: now.toISOString() }
        await tx
          .update(books)
          .set({
            ...(edit.title !== undefined ? { title: edit.title } : {}),
            ...(edit.description !== undefined ? { description: edit.description } : {}),
            ...(edit.primaryEditionId !== undefined
              ? { primaryEditionId: edit.primaryEditionId }
              : {}),
            fieldOrigins: origins,
            lockedFields: [...new Set([...before.lockedFields, ...fields])],
          })
          .where(eq(books.id, before.id))
        await refreshSearchVector(tx, before.id)

        const after = await loadBook(tx, before.id)
        if (!after) throw new Error('book vanished during its edit')
        await recordAudit(tx, {
          actorId,
          action: onlyPrimaryEdition ? 'book.primary_edition' : 'book.edit',
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
  app.post(
    '/admin/books/:id/cover',
    {
      preHandler: [manage],
      schema: { params: adminBookParamsSchema, response: { 200: adminBookCoverResponseSchema } },
    },
    async (request): Promise<AdminBook> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      const fileProblem = (detail: string) =>
        new HttpProblem(400, detail, { errors: [{ path: 'body.file', message: detail }] })
      if (!request.isMultipart()) throw fileProblem('Send the image as multipart form data.')
      const part = await request.file()
      if (!part) throw fileProblem('Choose an image to upload.')
      // Over the size limit, this throws a 413 that the error handler turns into Problem Details.
      const upload = await part.toBuffer()

      let image: Awaited<ReturnType<typeof processBookCover>>
      try {
        image = await processBookCover(upload)
      } catch (error) {
        if (error instanceof InvalidImageError) throw fileProblem(error.message)
        throw error
      }

      const coverId = newId()
      const key = `covers/${coverId}.webp`
      await storage.put(key, image.data, 'image/webp')

      const now = new Date()
      let previousKey: string | null = null
      try {
        const result = await db.transaction(async (tx) => {
          const before = await loadBook(tx, request.params.id, true)
          if (!before) throw new HttpProblem(404, 'Book not found.')
          const [current] = await tx
            .select({ id: covers.id, origin: covers.origin, key: covers.r2Key })
            .from(books)
            .innerJoin(covers, eq(covers.id, books.coverId))
            .where(eq(books.id, before.id))
          await tx.insert(covers).values({
            id: coverId,
            origin: 'upload',
            r2Key: key,
            width: image.width,
            height: image.height,
          })
          // A cover an Admin set is locked, so a refresh keeps it (PRD §5.2).
          await tx
            .update(books)
            .set({
              coverId,
              fieldOrigins: {
                ...before.fieldOrigins,
                cover: { source: ADMIN_ORIGIN, at: now.toISOString() },
              },
              lockedFields: [...new Set([...before.lockedFields, 'cover'])],
            })
            .where(eq(books.id, before.id))
          // Only an earlier upload is ours to delete; a Source cover is just a reference.
          if (current?.origin === 'upload') {
            await tx.delete(covers).where(eq(covers.id, current.id))
            previousKey = current.key
          }
          const after = await loadBook(tx, before.id)
          if (!after) throw new Error('book vanished during its cover upload')
          await recordAudit(tx, {
            actorId,
            action: 'cover.upload',
            targetType: 'book',
            targetId: before.id,
            before: {
              cover: before.cover
                ? { origin: before.cover.origin, originRef: before.cover.originRef }
                : null,
            },
            after: { cover: { origin: 'upload', key } },
            ip: request.ip,
          })
          return after
        })
        if (previousKey) {
          await storage.remove(previousKey).catch((error) => {
            request.log.warn(
              { err: error, key: previousKey },
              'could not remove the previous cover',
            )
          })
        }
        return result
      } catch (error) {
        await storage.remove(key).catch(() => {})
        throw error
      }
    },
  )

  app.post(
    '/admin/books/:id/refresh',
    {
      preHandler: [manage],
      schema: {
        params: adminBookParamsSchema,
        response: { 202: adminBookRefreshResponseSchema },
      },
    },
    async (request, reply): Promise<AdminBookRefreshResponse> => {
      if (!db || !request.auth) throw new Error('admin routes need a database')
      const actorId = request.auth.user.id
      if (!jobs) throw new HttpProblem(503, 'Refreshing is unavailable right now.')
      const bookId = request.params.id
      const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, bookId))
      if (!book) throw new HttpProblem(404, 'Book not found.')
      await jobs.enqueue(
        'catalog.refresh',
        { bookId, interactive: true },
        { priority: ADMIN_REFRESH_PRIORITY },
      )
      await db.transaction((tx) =>
        recordAudit(tx, {
          actorId,
          action: 'book.refresh',
          targetType: 'book',
          targetId: bookId,
          before: null,
          after: null,
          ip: request.ip,
        }),
      )
      reply.code(202)
      return { status: 'refresh_queued' }
    },
  )
}
