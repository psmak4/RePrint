import {
  authors,
  bookGenres,
  bookSeries,
  books,
  contributions,
  genres,
  series,
  sourceLinks,
} from '@reprint/db'
import {
  authorDetailSchema,
  bookRelatedResponseSchema,
  type ContributionRole,
  genreDetailResponseSchema,
  problemDetailsSchema,
  seriesDetailResponseSchema,
} from '@reprint/shared'
import { like } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { loadEnv } from '../../config/env.js'
import { startTestStack, type TestStack } from '../../testing/stack.js'

const queued: string[] = []
let stack: TestStack
let app: FastifyInstance

beforeAll(async () => {
  stack = await startTestStack()
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGINS: 'http://www.reprint.test:5173',
    DATABASE_URL: stack.databaseUrl,
    REDIS_URL: stack.redisUrl,
    HIBP_MODE: 'off',
  })
  app = await buildApp(env, {
    database: stack.db.db,
    redis: stack.redis,
    jobs: {
      enqueue: async (name) => {
        queued.push(name)
        return '1'
      },
    },
  })
  await app.ready()
})
afterAll(async () => {
  await app?.close()
  await stack?.stop()
})
beforeEach(async () => {
  queued.length = 0
  await stack.reset()
  // Genres are reference data that `reset` keeps, so remove the ones these tests add.
  await stack.db.db.delete(genres).where(like(genres.slug, 'zz-%'))
})

const db = () => stack.db.db
const get = (url: string) => app.inject({ method: 'GET', url })

async function makeBook(
  slug: string,
  {
    reviews = 0,
    sum = 0,
    editions = null,
  }: { reviews?: number; sum?: number; editions?: number | null } = {},
) {
  const [row] = await db()
    .insert(books)
    .values({
      slug,
      title: slug,
      reviewCount: reviews,
      ratingSum: sum,
      sourceEditionCount: editions,
    })
    .returning()
  if (!row) throw new Error('book not stored')
  return row
}

async function makeAuthor(slug: string) {
  const [row] = await db()
    .insert(authors)
    .values({ slug, name: slug, bio: `About ${slug}`, birthDate: '1892-01-03' })
    .returning()
  if (!row) throw new Error('author not stored')
  return row
}

async function credit(bookId: string, authorId: string, role: ContributionRole, position = 0) {
  await db().insert(contributions).values({ bookId, authorId, role, position })
}

/**
 * The rails as the Book page used to build them from the Author, Series, and Genre endpoints: the
 * Author's works flattened by Role, each Book once, this one left out, the first 6; the Series
 * around this Book; the Genre's top rated page without this Book, the first 6.
 */
async function railsTheOldWay(
  bookSlug: string,
  bookId: string,
  authorSlug: string,
  seriesSlug: string,
  genreSlug: string,
) {
  const author = authorDetailSchema.parse((await get(`/v1/authors/${authorSlug}`)).json())
  const seen = new Set<string>()
  const all = author.works
    .flatMap((work) => work.books)
    .filter((other) => !seen.has(other.id) && seen.add(other.id))
  const seriesDetail = seriesDetailResponseSchema.parse(
    (await get(`/v1/series/${seriesSlug}?around=${bookSlug}`)).json(),
  )
  const genre = genreDetailResponseSchema.parse(
    (await get(`/v1/genres/${genreSlug}?sort=top_rated`)).json(),
  )
  return {
    authorBooks: all
      .filter((other) => other.id !== bookId)
      .slice(0, 6)
      .map((other) => other.slug),
    bookCount: all.length,
    series: {
      total: seriesDetail.total,
      memberCount: seriesDetail.series.memberCount,
      items: seriesDetail.items.map((item) => [item.book.slug, item.position]),
    },
    genreBooks: genre.items
      .filter((other) => other.id !== bookId)
      .slice(0, 6)
      .map((other) => other.slug),
  }
}

describe('GET /v1/books/:slug/related (M10-T06)', () => {
  it('gives the Book page’s rails the same Books in the same order as the Author, Series, and Genre pages', async () => {
    const current = await makeBook('current', { reviews: 3, sum: 12 })
    const ada = await makeAuthor('ada-writer')
    const other = await makeAuthor('bo-co-author')
    await credit(current.id, ada.id, 'author', 0)
    await credit(current.id, other.id, 'co_author', 1)
    // Ada's other Books: ties broken by Source Edition count, then title; one is also an editor's.
    const spec: [string, ContributionRole[], number, number | null][] = [
      ['w-most-reviewed', ['author'], 9, 1],
      ['w-tie-more-editions', ['author'], 4, 20],
      ['w-tie-fewer-editions', ['author'], 4, 2],
      ['w-tie-no-editions-a', ['author'], 4, null],
      ['w-tie-no-editions-b', ['author'], 4, null],
      ['w-and-editor', ['author', 'editor'], 1, null],
      ['w-unreviewed', ['author'], 0, null],
      ['e-only-editor', ['editor'], 50, 99],
      ['t-translator', ['translator'], 70, null],
    ]
    for (const [slug, roles, reviews, editions] of spec) {
      const book = await makeBook(slug, { reviews, sum: reviews * 4, editions })
      for (const role of roles) await credit(book.id, ada.id, role)
    }
    // A Series of 10, with this Book fifth.
    const [saga] = await db()
      .insert(series)
      .values({ slug: 'ada-saga', name: 'Ada Saga', sourceMemberCount: 12 })
      .returning()
    if (!saga) throw new Error('series not stored')
    for (let position = 1; position <= 10; position += 1) {
      const member = position === 5 ? current : await makeBook(`saga-${position}`)
      await db().insert(bookSeries).values({ bookId: member.id, seriesId: saga.id, position })
    }
    // Two Genres; the first by name has a child Genre whose Books count too.
    const [parent] = await db()
      .insert(genres)
      .values({ slug: 'zz-a-parent', name: 'A parent' })
      .returning()
    const [child] = await db()
      .insert(genres)
      .values({ slug: 'zz-child', name: 'Child', parentId: parent?.id ?? null })
      .returning()
    const [later] = await db()
      .insert(genres)
      .values({ slug: 'zz-z-later', name: 'Z later' })
      .returning()
    if (!parent || !child || !later) throw new Error('genres not stored')
    await db()
      .insert(bookGenres)
      .values([
        { bookId: current.id, genreId: parent.id },
        { bookId: current.id, genreId: later.id },
      ])
    for (let i = 0; i < 9; i += 1) {
      const book = await makeBook(`g-${i}`, { reviews: i, sum: i * (1 + (i % 4)) })
      await db()
        .insert(bookGenres)
        .values({ bookId: book.id, genreId: i % 2 ? child.id : parent.id })
    }

    const response = await get('/v1/books/current/related')
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toContain('public')
    const related = bookRelatedResponseSchema.parse(response.json())
    const old = await railsTheOldWay('current', current.id, 'ada-writer', 'ada-saga', 'zz-a-parent')

    expect(related.author?.slug).toBe('ada-writer')
    expect(related.author?.bio).toBe('About ada-writer')
    expect(related.author?.birthDate).toBe('1892-01-03')
    expect(related.author?.books.map((book) => book.slug)).toEqual(old.authorBooks)
    expect(related.author?.bookCount).toBe(old.bookCount)
    expect(related.series).toMatchObject({
      slug: 'ada-saga',
      name: 'Ada Saga',
      total: old.series.total,
      memberCount: old.series.memberCount,
    })
    expect(related.series?.items.map((item) => [item.book.slug, item.position])).toEqual(
      old.series.items,
    )
    expect(related.genre).toMatchObject({ slug: 'zz-a-parent', name: 'A parent' })
    expect(related.genre?.books.map((book) => book.slug)).toEqual(old.genreBooks)
    expect(old.authorBooks).toHaveLength(6)
    expect(old.genreBooks).toHaveLength(6)
  })

  it('counts every Book the Author is credited on, past the first page of Written Books', async () => {
    const prolific = await makeAuthor('prolific')
    for (let i = 0; i < 30; i += 1) {
      const book = await makeBook(`p-${String(i).padStart(2, '0')}`)
      await credit(book.id, prolific.id, 'author')
    }
    const related = bookRelatedResponseSchema.parse((await get('/v1/books/p-00/related')).json())
    expect(related.author?.bookCount).toBe(30)
    expect(related.author?.books).toHaveLength(6)
  })

  it('never queues the Author’s bibliography import, which the Author page still does (D-205)', async () => {
    const book = await makeBook('reached')
    const due = await makeAuthor('due-author')
    await credit(book.id, due.id, 'author')
    await db().insert(sourceLinks).values({
      entityType: 'author',
      entityId: due.id,
      source: 'stub',
      sourceId: 'stub-author-due',
    })
    expect((await get('/v1/books/reached/related')).statusCode).toBe(200)
    expect(queued).not.toContain('catalog.author-sync')
    expect((await get('/v1/authors/due-author')).statusCode).toBe(200)
    expect(queued).toContain('catalog.author-sync')
  })

  it('has no part for a Book with no Author, Series, or Genre, or only an archived Genre', async () => {
    const lonely = await makeBook('lonely')
    const [archived] = await db()
      .insert(genres)
      .values({ slug: 'zz-archived', name: 'Archived', archivedAt: new Date() })
      .returning()
    if (!archived) throw new Error('genre not stored')
    await db().insert(bookGenres).values({ bookId: lonely.id, genreId: archived.id })
    const related = bookRelatedResponseSchema.parse((await get('/v1/books/lonely/related')).json())
    expect(related).toEqual({ author: null, series: null, genre: null })
  })

  it('returns 404 Problem Details for an unknown Book and 400 for a malformed slug', async () => {
    const unknown = await get('/v1/books/no-such-book/related')
    expect(unknown.statusCode).toBe(404)
    expect(problemDetailsSchema.parse(unknown.json()).status).toBe(404)
    expect((await get('/v1/books/Not_A_Slug/related')).statusCode).toBe(400)
  })
})
