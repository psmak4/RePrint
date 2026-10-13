import { authors, books, createDb } from '@reprint/db'
import { startTestDatabase, type TestDatabase, truncateAllTables } from '@reprint/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanStoredMarkup } from './clean-markup.js'
import { sourceTextCleaners } from './sources/index.js'

let database: TestDatabase
let db: ReturnType<typeof createDb>['db']
let closeDb: () => Promise<void>

beforeAll(async () => {
  database = await startTestDatabase()
  const client = createDb(database.url)
  db = client.db
  closeDb = client.close
})
afterAll(async () => {
  await closeDb?.()
  await database?.stop()
})
beforeEach(async () => {
  await truncateAllTables(database.sql)
})

const at = '2026-10-01T00:00:00.000Z'
const fromSource = (field: string) => ({ [field]: { source: 'open_library', at } })
/** Stored before D-202: a Source page link, and its footer after the divider. */
const raw =
  'An Irish author ([source][1]). See [his page](https://openlibrary.org/authors/eoin).\r\n\r\n[1]: https://en.wikipedia.org/wiki/Eoin_Colfer\r\n\r\n---\r\n\r\nAlso by him.'
const clean =
  'An Irish author ([source][1]). See his page.\n\n[1]: https://en.wikipedia.org/wiki/Eoin_Colfer'

async function bookDescription(slug: string) {
  const [row] = await db
    .select({ description: books.description })
    .from(books)
    .where(eq(books.slug, slug))
  return row?.description
}

describe('cleanStoredMarkup', () => {
  it('re-reads Source descriptions and bios the way an import now would', async () => {
    await db.insert(books).values({
      slug: 'artemis-fowl',
      title: 'Artemis Fowl',
      description: raw,
      fieldOrigins: fromSource('description'),
    })
    await db.insert(authors).values({
      slug: 'eoin-colfer',
      name: 'Eoin Colfer',
      bio: raw,
      fieldOrigins: fromSource('bio'),
    })

    expect(await cleanStoredMarkup(db, sourceTextCleaners)).toEqual({ books: 1, authors: 1 })
    expect(await bookDescription('artemis-fowl')).toBe(clean)
    const [author] = await db.select({ bio: authors.bio }).from(authors)
    expect(author?.bio).toBe(clean)
  })

  it('leaves admin text, locked fields, and other Sources alone', async () => {
    await db.insert(books).values([
      {
        slug: 'by-admin',
        title: 'By an admin',
        description: raw,
        fieldOrigins: { description: { source: 'admin', at } },
        lockedFields: ['description'],
      },
      {
        slug: 'locked',
        title: 'Locked',
        description: raw,
        fieldOrigins: fromSource('description'),
        lockedFields: ['description'],
      },
      {
        slug: 'other-source',
        title: 'Another Source',
        description: raw,
        fieldOrigins: { description: { source: 'elsewhere', at } },
      },
      { slug: 'no-origin', title: 'No origin', description: raw },
    ])

    expect(await cleanStoredMarkup(db, sourceTextCleaners)).toEqual({ books: 0, authors: 0 })
    for (const slug of ['by-admin', 'locked', 'other-source', 'no-origin']) {
      expect(await bookDescription(slug)).toBe(raw)
    }
  })

  it('changes nothing the second time', async () => {
    await db.insert(books).values({
      slug: 'artemis-fowl',
      title: 'Artemis Fowl',
      description: raw,
      fieldOrigins: fromSource('description'),
    })
    await cleanStoredMarkup(db, sourceTextCleaners)
    expect(await cleanStoredMarkup(db, sourceTextCleaners)).toEqual({ books: 0, authors: 0 })
    expect(await bookDescription('artemis-fowl')).toBe(clean)
  })
})
