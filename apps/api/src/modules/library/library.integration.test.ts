import { authors, books, contributions, newId, shelfEntries, users } from '@reprint/db'
import { libraryResponseSchema } from '@reprint/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'
import { createTestUser } from '../../testing/users.js'
import { SESSION_COOKIE } from '../auth/session-cookie.js'

const ORIGIN = 'http://www.reprint.test:5173'

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

beforeEach(async () => {
  await stack.reset()
})

async function member(options: { verified?: boolean } = {}) {
  const user = await createTestUser(stack.db.db, options)
  const started = await app.inject({ method: 'GET', url: `/test/start/${user.id}` })
  const cookies = {
    [SESSION_COOKIE]: started.cookies.find((c) => c.name === SESSION_COOKIE)?.value ?? '',
  }
  return { user, cookies }
}

async function shelved(
  userId: string,
  title: string,
  shelf: 'want_to_read' | 'reading' | 'read',
  addedAt: string,
  authorName?: string,
) {
  const id = newId()
  await stack.db.db.insert(books).values({ id, slug: `book-${id.slice(-8)}`, title })
  if (authorName) {
    const authorId = newId()
    await stack.db.db
      .insert(authors)
      .values({ id: authorId, slug: `author-${authorId.slice(-8)}`, name: authorName })
    await stack.db.db
      .insert(contributions)
      .values({ bookId: id, authorId, role: 'author', position: 0 })
  }
  await stack.db.db
    .insert(shelfEntries)
    .values({ userId, bookId: id, shelf, addedAt: new Date(addedAt) })
  return id
}

function library(username: string, query = '', cookies?: Record<string, string>) {
  return app.inject({ method: 'GET', url: `/v1/users/${username}/library${query}`, cookies })
}

describe('GET /v1/users/:username/library', () => {
  it('lists entries newest first with counts per Shelf', async () => {
    const { user } = await member()
    await shelved(user.id, 'Alpha', 'read', '2026-01-01T00:00:00Z')
    await shelved(user.id, 'Beta', 'reading', '2026-02-01T00:00:00Z')
    await shelved(user.id, 'Gamma', 'want_to_read', '2026-03-01T00:00:00Z')
    await shelved(user.id, 'Delta', 'read', '2026-04-01T00:00:00Z')

    const res = await library(user.username)
    expect(res.statusCode).toBe(200)
    const body = libraryResponseSchema.parse(res.json())
    expect(body.items.map((entry) => entry.book.title)).toEqual(['Delta', 'Gamma', 'Beta', 'Alpha'])
    expect(body.items[0]?.shelf).toBe('read')
    expect(body.counts).toEqual({ all: 4, want_to_read: 1, reading: 1, read: 2 })
    expect(body.meta).toMatchObject({ page: 1, total: 4, totalPages: 1 })
    expect(res.headers['cache-control']).toContain('private')
  })

  it('filters by Shelf and keeps all counts', async () => {
    const { user } = await member()
    await shelved(user.id, 'Alpha', 'read', '2026-01-01T00:00:00Z')
    await shelved(user.id, 'Beta', 'reading', '2026-02-01T00:00:00Z')
    const body = libraryResponseSchema.parse((await library(user.username, '?shelf=read')).json())
    expect(body.items.map((entry) => entry.book.title)).toEqual(['Alpha'])
    expect(body.meta.total).toBe(1)
    expect(body.counts.all).toBe(2)
    expect((await library(user.username, '?shelf=nope')).statusCode).toBe(400)
  })

  it('sorts by date added, title, and author', async () => {
    const { user } = await member()
    await shelved(user.id, 'Charlie', 'read', '2026-01-01T00:00:00Z', 'Adams')
    await shelved(user.id, 'Alpha', 'read', '2026-02-01T00:00:00Z', 'Zed')
    await shelved(user.id, 'Bravo', 'read', '2026-03-01T00:00:00Z')
    const titles = async (sort: string) =>
      libraryResponseSchema
        .parse((await library(user.username, `?sort=${sort}`)).json())
        .items.map((entry) => entry.book.title)
    expect(await titles('added_desc')).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(await titles('added_asc')).toEqual(['Charlie', 'Alpha', 'Bravo'])
    expect(await titles('title')).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(await titles('author')).toEqual(['Charlie', 'Alpha', 'Bravo'])
  })

  it('paginates', async () => {
    const { user } = await member()
    for (const [i, title] of ['A', 'B', 'C'].entries()) {
      await shelved(user.id, title, 'read', `2026-01-0${i + 1}T00:00:00Z`)
    }
    const body = libraryResponseSchema.parse(
      (await library(user.username, '?pageSize=2&page=2')).json(),
    )
    expect(body.items.map((entry) => entry.book.title)).toEqual(['A'])
    expect(body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 })
  })

  it('returns an empty Library for a Member with no entries', async () => {
    const { user } = await member()
    const body = libraryResponseSchema.parse((await library(user.username)).json())
    expect(body.items).toEqual([])
    expect(body.counts.all).toBe(0)
  })

  it('hides a private library from Visitors and other Members, but not its owner', async () => {
    const owner = await member()
    const other = await member()
    await shelved(owner.user.id, 'Secret', 'read', '2026-01-01T00:00:00Z')
    await stack.db.db.update(users).set({ libraryPublic: false }).where(eq(users.id, owner.user.id))

    const visitor = await library(owner.user.username)
    expect(visitor.statusCode).toBe(404)
    expect(visitor.json().status).toBe(404)
    expect((await library(owner.user.username, '', other.cookies)).statusCode).toBe(404)
    const own = await library(owner.user.username, '', owner.cookies)
    expect(own.statusCode).toBe(200)
    expect(libraryResponseSchema.parse(own.json()).counts.all).toBe(1)
  })

  it('returns 404 for unknown and deleted users', async () => {
    expect((await library('no_such_user')).statusCode).toBe(404)
    const gone = await createTestUser(stack.db.db, { status: 'deleted' })
    expect((await library(gone.username)).statusCode).toBe(404)
  })
})
