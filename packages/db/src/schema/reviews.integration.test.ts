import { REVIEW_STATUSES } from '@reprint/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '../testing/postgres.js'

let database: TestDatabase

beforeAll(async () => {
  database = await startTestDatabase()
})

afterAll(async () => {
  await database?.stop()
})

beforeEach(async () => {
  await truncateAllTables(database.sql)
})

const BODY = 'x'.repeat(50)

async function insertUser(username = 'Ada') {
  const [row] = await database.sql<{ id: string }[]>`
    insert into users (id, email, username, password_hash, display_name)
    values (uuidv7(), ${`${username}@example.com`}, ${username}, 'x', ${username})
    returning id`
  return row?.id ?? ''
}

async function insertBook(slug = 'dune-0192a3') {
  const [row] = await database.sql<{ id: string }[]>`
    insert into books (id, slug, title) values (uuidv7(), ${slug}, 'Dune') returning id`
  return row?.id ?? ''
}

async function insertReview(
  userId: string,
  bookId: string,
  fields: { rating?: number; body?: string; headline?: string | null; status?: string } = {},
) {
  const [row] = await database.sql<{ id: string }[]>`
    insert into reviews (id, user_id, book_id, rating, headline, body, status)
    values (uuidv7(), ${userId}, ${bookId}, ${fields.rating ?? 4}, ${fields.headline ?? null},
      ${fields.body ?? BODY}, ${fields.status ?? 'pending'})
    returning id`
  return row?.id ?? ''
}

describe('reviews schema', () => {
  it('creates the review tables', async () => {
    const rows = await database.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const names = rows.map((r) => r.tablename)
    for (const table of ['reviews', 'review_versions', 'review_claims'])
      expect(names).toContain(table)
  })

  it('defaults a new review to Pending with no helpful votes', async () => {
    const id = await insertReview(await insertUser(), await insertBook())
    const [row] = await database.sql<
      { status: string; helpful_count: number; has_spoilers: boolean }[]
    >`
      select status, helpful_count, has_spoilers from reviews where id = ${id}`
    expect(row).toEqual({ status: 'pending', helpful_count: 0, has_spoilers: false })
  })

  it('allows one review per Member per Book', async () => {
    const userId = await insertUser()
    const bookId = await insertBook()
    await insertReview(userId, bookId)
    await expect(insertReview(userId, bookId)).rejects.toThrow(/reviews_user_id_book_id_unique/)
    // Another Book, or another Member, is fine.
    await insertReview(userId, await insertBook('hobbit-0192a4'))
    await insertReview(await insertUser('Grace'), bookId)
  })

  it('accepts ratings 1 to 5 only', async () => {
    const userId = await insertUser()
    for (const rating of [0, 6, -1])
      await expect(
        insertReview(userId, await insertBook(`b${rating}-0192a3`), { rating }),
      ).rejects.toThrow(/reviews_rating_check/)
    for (const rating of [1, 5])
      await insertReview(userId, await insertBook(`ok${rating}-0192a3`), { rating })
  })

  it('accepts the four statuses only', async () => {
    const userId = await insertUser()
    for (const status of REVIEW_STATUSES)
      await insertReview(userId, await insertBook(`s-${status}-0192a3`), { status })
    await expect(
      insertReview(userId, await insertBook('bad-0192a3'), { status: 'draft' }),
    ).rejects.toThrow(/reviews_status_check/)
  })

  it('limits the headline to 120 and the body to 50 through 10,000 characters', async () => {
    const userId = await insertUser()
    await insertReview(userId, await insertBook('a-0192a3'), {
      headline: 'h'.repeat(120),
      body: 'x'.repeat(10_000),
    })
    await expect(
      insertReview(userId, await insertBook('b-0192a3'), { headline: 'h'.repeat(121) }),
    ).rejects.toThrow(/reviews_headline_length_check/)
    await expect(
      insertReview(userId, await insertBook('c-0192a3'), { body: 'x'.repeat(49) }),
    ).rejects.toThrow(/reviews_body_length_check/)
    await expect(
      insertReview(userId, await insertBook('d-0192a3'), { body: 'x'.repeat(10_001) }),
    ).rejects.toThrow(/reviews_body_length_check/)
  })

  it('refuses to delete a Book that has reviews', async () => {
    const bookId = await insertBook()
    await insertReview(await insertUser(), bookId)
    await expect(database.sql`delete from books where id = ${bookId}`).rejects.toThrow(
      /reviews_book_id_books_id_fk/,
    )
  })

  it('erases a Member’s reviews, versions, and claims with the Member', async () => {
    const authorId = await insertUser('Ada')
    const moderatorId = await insertUser('Grace')
    const reviewId = await insertReview(authorId, await insertBook())
    await database.sql`
      insert into review_versions (id, review_id, version, rating, body)
      values (uuidv7(), ${reviewId}, 1, 4, ${BODY})`
    await database.sql`
      insert into review_claims (review_id, moderator_id, expires_at)
      values (${reviewId}, ${moderatorId}, now() + interval '10 minutes')`

    await database.sql`delete from users where id = ${authorId}`

    for (const table of ['reviews', 'review_versions', 'review_claims'])
      expect(await database.sql`select 1 from ${database.sql(table)}`).toHaveLength(0)
  })

  it('keeps a version’s decision when the Moderator is erased', async () => {
    const moderatorId = await insertUser('Grace')
    const reviewId = await insertReview(await insertUser('Ada'), await insertBook())
    await database.sql`
      insert into review_versions (id, review_id, version, rating, body, status, decided_by, decided_at)
      values (uuidv7(), ${reviewId}, 1, 4, ${BODY}, 'approved', ${moderatorId}, now())`

    await database.sql`delete from users where id = ${moderatorId}`

    const [row] = await database.sql<{ status: string; decided_by: string | null }[]>`
      select status, decided_by from review_versions where review_id = ${reviewId}`
    expect(row).toEqual({ status: 'approved', decided_by: null })
  })

  it('numbers versions uniquely per review', async () => {
    const reviewId = await insertReview(await insertUser(), await insertBook())
    const insertVersion = (version: number) => database.sql`
      insert into review_versions (id, review_id, version, rating, body)
      values (uuidv7(), ${reviewId}, ${version}, 4, ${BODY})`
    await insertVersion(1)
    await insertVersion(2)
    await expect(insertVersion(2)).rejects.toThrow(/review_versions_review_id_version_idx/)
    await expect(insertVersion(0)).rejects.toThrow(/review_versions_version_check/)
  })

  it('allows one claim per review', async () => {
    const moderatorId = await insertUser('Grace')
    const reviewId = await insertReview(await insertUser('Ada'), await insertBook())
    const claim = () => database.sql`
      insert into review_claims (review_id, moderator_id, expires_at)
      values (${reviewId}, ${moderatorId}, now() + interval '10 minutes')`
    await claim()
    await expect(claim()).rejects.toThrow(/review_claims_pkey/)
  })
})
