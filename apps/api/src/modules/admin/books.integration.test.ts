import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  auditLog,
  authors,
  bookGenres,
  books,
  contributions,
  covers,
  editions,
  genres,
} from '@reprint/db'
import {
  adminBookDetailSchema,
  adminBookSchema,
  adminBookSearchResponseSchema,
  type BookCandidate,
} from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { jobs } from '../../jobs/registry.js'
import { LocalImageStorage } from '../../storage/index.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const stub = createStubSource()

let stack: TestStack
let app: FastifyInstance
let uploadDir: string
const enqueue = vi.fn(async (_name: string, _payload: object, _options?: object) => '1')
const IMAGE_BASE = 'http://img.reprint.test/v1/uploads'

beforeAll(async () => {
  stack = await startTestStack()
  uploadDir = await mkdtemp(join(tmpdir(), 'reprint-covers-'))
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    storage: new LocalImageStorage(uploadDir, IMAGE_BASE),
    jobs: { enqueue } as never,
  })
  app.get('/test/start/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    await app.sessions.start(request, reply, userId)
    return { ok: true }
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  await stack?.stop()
  await rm(uploadDir, { recursive: true, force: true })
})

beforeEach(async () => {
  await stack.reset()
  await rm(uploadDir, { recursive: true, force: true })
  enqueue.mockClear()
})

async function person(roles: string[] = ['member']) {
  const user = await createTestUser(stack.db.db, { roles })
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function candidate(): Promise<BookCandidate> {
  const found = await stub.getBook('stub-book-dune')
  if (!found) throw new Error('stub has no Dune')
  return found
}

async function dune() {
  const result = await ingestBook(stack.db.db, { source: stub, candidate: await candidate() })
  return result.bookId
}

const patch = (id: string, payload: object, cookies?: Record<string, string>) =>
  app.inject({
    method: 'PATCH',
    url: `/v1/admin/books/${id}`,
    cookies,
    payload,
    headers: { origin: ORIGIN },
  })

describe('GET /v1/admin/books', () => {
  const search = (query: string, cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/v1/admin/books?${query}`, cookies })

  it('finds Catalog Books by title or Author for an Admin, with their IDs', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    for (const q of ['dune', 'herbert']) {
      const response = await search(new URLSearchParams({ q }).toString(), admin.cookies)
      expect(response.statusCode).toBe(200)
      const body = adminBookSearchResponseSchema.parse(response.json())
      expect(body).toMatchObject({ page: 1, hasMore: false })
      expect(body.items.map((item) => item.id)).toEqual([bookId])
    }
  })

  it('finds nothing for a query shorter than the search minimum', async () => {
    await dune()
    const admin = await person(['admin'])
    const response = await search('q=d', admin.cookies)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ items: [], page: 1, hasMore: false })
  })

  it('is denied to a Moderator and to a Visitor', async () => {
    await dune()
    const moderator = await person(['moderator'])
    expect((await search('q=dune', moderator.cookies)).statusCode).toBe(403)
    expect((await search('q=dune')).statusCode).toBe(401)
  })
})

describe('GET /v1/admin/books/:id', () => {
  const get = (id: string, cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url: `/v1/admin/books/${id}`, cookies })

  it('returns the editable view with locks and the Book’s Editions', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    await patch(bookId, { title: 'Dune (edited)' }, admin.cookies)
    const res = await get(bookId, admin.cookies)
    expect(res.statusCode).toBe(200)
    const body = adminBookDetailSchema.parse(res.json())
    expect(body.title).toBe('Dune (edited)')
    expect(body.lockedFields).toContain('title')
    expect(body.editions.length).toBeGreaterThan(0)
    expect((await get('0192a3b4-0000-7000-8000-000000000001', admin.cookies)).statusCode).toBe(404)
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const bookId = await dune()
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await get(bookId, moderator.cookies)).statusCode).toBe(403)
    expect((await get(bookId, member.cookies)).statusCode).toBe(403)
    expect((await get(bookId)).statusCode).toBe(401)
  })
})

describe('PATCH /v1/admin/books/:id', () => {
  it('edits fields, locks them, and audits before and after values', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const [genre] = await stack.db.db.select().from(genres).limit(1)
    if (!genre) throw new Error('no genres seeded')

    const response = await patch(
      bookId,
      {
        title: 'Dune (Revised)',
        description: 'Edited by an Admin.',
        genreIds: [genre.id],
        series: [{ name: 'Dune Chronicles', position: 1.5 }],
        contributions: [
          { name: 'Frank Herbert', role: 'author' },
          { name: 'Brian', role: 'editor' },
        ],
      },
      admin.cookies,
    )
    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.title).toBe('Dune (Revised)')
    expect(body.genres.map((g: { id: string }) => g.id)).toEqual([genre.id])
    expect(body.series).toMatchObject([{ name: 'Dune Chronicles', position: 1.5 }])
    expect(body.contributions.map((c: { name: string }) => c.name)).toEqual([
      'Frank Herbert',
      'Brian',
    ])
    expect(body.lockedFields.sort()).toEqual(
      ['contributions', 'description', 'genres', 'series', 'title'].sort(),
    )
    for (const field of ['title', 'description', 'genres', 'series', 'contributions']) {
      expect(body.fieldOrigins[field].source).toBe('admin')
    }
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(row?.searchVector).toContain('chronicl')
    const [link] = await stack.db.db.select().from(bookGenres).where(eq(bookGenres.bookId, bookId))
    expect(link?.origin).toBe('admin')

    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({
      action: 'book.edit',
      targetType: 'book',
      targetId: bookId,
      actorId: admin.user.id,
    })
    expect(entry?.before).toMatchObject({ title: 'Dune' })
    expect(entry?.after).toMatchObject({
      title: 'Dune (Revised)',
      series: [{ name: 'Dune Chronicles', position: 1.5 }],
    })
  })

  it('leaves untouched fields unlocked and keeps edited ones through a refresh', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const edited = await patch(bookId, { title: 'Locked Title' }, admin.cookies)
    expect(edited.json().lockedFields).toEqual(['title'])

    const original = await candidate()
    await ingestBook(stack.db.db, {
      source: stub,
      candidate: {
        ...original,
        book: { ...original.book, title: 'Source Title', description: 'New from the Source.' },
      },
    })
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(row?.title).toBe('Locked Title')
    expect(row?.description).toBe('New from the Source.')
  })

  it('keeps an edited Genre list and Contributions through a refresh', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const allGenres = await stack.db.db.select().from(genres).limit(2)
    const chosen = allGenres.map((g) => g.id)
    await patch(
      bookId,
      { genreIds: chosen, contributions: [{ name: 'Someone Else', role: 'author' }] },
      admin.cookies,
    )
    await ingestBook(stack.db.db, { source: stub, candidate: await candidate() })
    const links = await stack.db.db.select().from(bookGenres).where(eq(bookGenres.bookId, bookId))
    expect(links.map((l) => l.genreId).sort()).toEqual([...chosen].sort())
    const credits = await stack.db.db
      .select({ name: authors.name })
      .from(contributions)
      .innerJoin(authors, eq(authors.id, contributions.authorId))
      .where(eq(contributions.bookId, bookId))
    expect(credits).toEqual([{ name: 'Someone Else' }])
  })

  it('rejects bad input and unknown records', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    expect((await patch(bookId, {}, admin.cookies)).statusCode).toBe(400)
    expect((await patch(bookId, { title: '  ' }, admin.cookies)).statusCode).toBe(400)
    expect((await patch(bookId, { contributions: [] }, admin.cookies)).statusCode).toBe(400)
    const unknownGenre = await patch(
      bookId,
      { genreIds: ['019a0000-0000-7000-8000-000000000000'] },
      admin.cookies,
    )
    expect(unknownGenre.statusCode).toBe(400)
    const twice = await patch(
      bookId,
      {
        series: [
          { name: 'Same', position: 1 },
          { name: 'same', position: 2 },
        ],
      },
      admin.cookies,
    )
    expect(twice.statusCode).toBe(400)
    const missing = await patch(
      '019a0000-0000-7000-8000-000000000000',
      { title: 'Nope' },
      admin.cookies,
    )
    expect(missing.statusCode).toBe(404)
    expect(await stack.db.db.select().from(auditLog)).toHaveLength(0)
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(row?.title).toBe('Dune')
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const bookId = await dune()
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await patch(bookId, { title: 'X' }, moderator.cookies)).statusCode).toBe(403)
    expect((await patch(bookId, { title: 'X' }, member.cookies)).statusCode).toBe(403)
    expect((await patch(bookId, { title: 'X' })).statusCode).toBe(401)
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(row?.title).toBe('Dune')
  })
})

function coverUpload(id: string, file: Buffer, cookies?: Record<string, string>) {
  const boundary = '----reprint-test-boundary'
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`,
  )
  return app.inject({
    method: 'POST',
    url: `/v1/admin/books/${id}/cover`,
    cookies,
    headers: {
      origin: ORIGIN,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat([head, file, Buffer.from(`\r\n--${boundary}--\r\n`)]),
  })
}

const png = (width = 1200, height = 1800) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .png()
    .toBuffer()

describe('POST /v1/admin/books/:id/cover', () => {
  it('stores a WebP of at most 600 px as an upload cover, locks it, and audits it', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const response = await coverUpload(bookId, await png(), admin.cookies)

    expect(response.statusCode).toBe(200)
    const body = adminBookSchema.parse(response.json())
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    const [cover] = await stack.db.db
      .select()
      .from(covers)
      .where(eq(covers.id, row?.coverId ?? ''))
    expect(cover).toMatchObject({ origin: 'upload', width: 600, height: 900 })
    expect(body.cover).toMatchObject({ origin: 'upload', url: `${IMAGE_BASE}/${cover?.r2Key}` })
    expect(body.lockedFields).toContain('cover')
    expect(body.fieldOrigins.cover?.source).toBe('admin')
    const meta = await sharp(await readFile(join(uploadDir, cover?.r2Key ?? ''))).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 600 })
    expect(meta.exif).toBeUndefined()

    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({ action: 'cover.upload', targetId: bookId })
  })

  it('keeps the uploaded cover through a refresh and replaces an earlier upload', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    await coverUpload(bookId, await png(), admin.cookies)
    const [first] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    await ingestBook(stack.db.db, { source: stub, candidate: await candidate() })
    const [afterRefresh] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(afterRefresh?.coverId).toBe(first?.coverId)

    await coverUpload(bookId, await png(300, 400), admin.cookies)
    const stored = await stack.db.db.select().from(covers).where(eq(covers.origin, 'upload'))
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).not.toBe(first?.coverId)
    expect(stored[0]).toMatchObject({ width: 300, height: 400 })
  })

  it('rejects a file that is not an image and one over the size limit', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const text = await coverUpload(bookId, Buffer.from('not an image'), admin.cookies)
    expect(text.statusCode).toBe(400)
    expect(text.json().errors[0].path).toBe('body.file')
    const big = await coverUpload(bookId, Buffer.alloc(6_000_000, 1), admin.cookies)
    expect(big.statusCode).toBe(413)
    const missing = await coverUpload(
      '019a0000-0000-7000-8000-000000000000',
      await png(),
      admin.cookies,
    )
    expect(missing.statusCode).toBe(404)
    expect(await stack.db.db.select().from(covers).where(eq(covers.origin, 'upload'))).toHaveLength(
      0,
    )
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const bookId = await dune()
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await coverUpload(bookId, await png(), moderator.cookies)).statusCode).toBe(403)
    expect((await coverUpload(bookId, await png(), member.cookies)).statusCode).toBe(403)
    expect((await coverUpload(bookId, await png())).statusCode).toBe(401)
  })
})

describe('Primary Edition choice through PATCH /v1/admin/books/:id', () => {
  it('sets one of the Book’s Editions, locks it, and keeps it through a refresh', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const [other] = await stack.db.db
      .insert(editions)
      .values({ bookId, isbn13: '9782070360024', format: 'paperback', language: 'fr' })
      .returning()
    if (!other) throw new Error('could not add an Edition')
    const [before] = await stack.db.db.select().from(books).where(eq(books.id, bookId))

    const response = await patch(bookId, { primaryEditionId: other.id }, admin.cookies)
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ primaryEditionId: other.id })
    expect(response.json().lockedFields).toEqual(['primaryEdition'])

    await ingestBook(stack.db.db, { source: stub, candidate: await candidate() })
    const [after] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(after?.primaryEditionId).toBe(other.id)

    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({ action: 'book.primary_edition', targetId: bookId })
    expect(entry?.before).toEqual({ primaryEdition: before?.primaryEditionId })
    expect(entry?.after).toEqual({ primaryEdition: other.id })
  })

  it('rejects an Edition that belongs to another Book', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const response = await patch(
      bookId,
      { primaryEditionId: '019a0000-0000-7000-8000-000000000000' },
      admin.cookies,
    )
    expect(response.statusCode).toBe(400)
    expect(response.json().errors[0].path).toBe('body.primaryEditionId')
  })
})

describe('POST /v1/admin/books/:id/refresh', () => {
  const refresh = (id: string, cookies?: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: `/v1/admin/books/${id}/refresh`,
      cookies,
      headers: { origin: ORIGIN },
    })

  it('queues an interactive-priority refresh and audits it', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    const response = await refresh(bookId, admin.cookies)
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ status: 'refresh_queued' })
    expect(enqueue).toHaveBeenCalledWith(
      'catalog.refresh',
      { bookId, interactive: true },
      { priority: 1 },
    )
    const [entry] = await stack.db.db.select().from(auditLog)
    expect(entry).toMatchObject({ action: 'book.refresh', targetId: bookId })
  })

  it('runs the job with Source calls at interactive priority and keeps locked fields', async () => {
    const bookId = await dune()
    const admin = await person(['admin'])
    await patch(bookId, { title: 'Locked Title' }, admin.cookies)
    const interactive = vi.fn(<T>(fn: () => Promise<T>, _timeoutMs: number) => fn())
    const background = vi.fn(<T>(fn: () => Promise<T>) => fn())
    const outcome = await jobs['catalog.refresh'].handler({ bookId, interactive: true }, {
      db: stack.db.db,
      log: { info: () => {} } as never,
      catalog: { source: stub, interactive, background },
    } as never)
    expect(outcome).toEqual({ outcome: 'refreshed' })
    expect(interactive).toHaveBeenCalled()
    expect(background).not.toHaveBeenCalled()
    const [row] = await stack.db.db.select().from(books).where(eq(books.id, bookId))
    expect(row?.title).toBe('Locked Title')
  })

  it('returns 404 for an unknown Book and queues nothing', async () => {
    const admin = await person(['admin'])
    const response = await refresh('019a0000-0000-7000-8000-000000000000', admin.cookies)
    expect(response.statusCode).toBe(404)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('denies Moderators and Members with 403 and Visitors with 401', async () => {
    const bookId = await dune()
    const moderator = await person(['moderator'])
    const member = await person()
    expect((await refresh(bookId, moderator.cookies)).statusCode).toBe(403)
    expect((await refresh(bookId, member.cookies)).statusCode).toBe(403)
    expect((await refresh(bookId)).statusCode).toBe(401)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
