import { auditLog, authors, bookGenres, books, contributions, genres } from '@reprint/db'
import type { BookCandidate } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ingestBook } from '../../catalog/ingest/ingest.js'
import { createStubSource } from '../../catalog/sources/stub/stub-adapter.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'
const stub = createStubSource()

let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: ORIGIN,
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
  })
  app = await buildApp(env, { database: stack.db.db, redis: stack.redis })
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
})

beforeEach(() => stack.reset())

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
