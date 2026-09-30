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

async function insertBook(slug = 'dune-0192a3', title = 'Dune') {
  const [row] = await database.sql<{ id: string }[]>`
    insert into books (id, slug, title) values (uuidv7(), ${slug}, ${title}) returning id`
  return row?.id ?? ''
}

async function insertAuthor(slug = 'frank-herbert-0192a4', name = 'Frank Herbert') {
  const [row] = await database.sql<{ id: string }[]>`
    insert into authors (id, slug, name) values (uuidv7(), ${slug}, ${name}) returning id`
  return row?.id ?? ''
}

describe('catalog schema (part 1)', () => {
  it('creates every table', async () => {
    const rows = await database.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const names = rows.map((r) => r.tablename)
    for (const table of [
      'books',
      'editions',
      'authors',
      'contributions',
      'source_links',
      'source_records',
    ]) {
      expect(names).toContain(table)
    }
  })

  it('starts a Book with zeroed aggregates', async () => {
    const id = await insertBook()
    const [row] = await database.sql`
      select review_count, rating_sum, rating_counts from books where id = ${id}`
    expect(row).toEqual({ review_count: 0, rating_sum: 0, rating_counts: [0, 0, 0, 0, 0] })
  })

  it('rejects rating_counts that are not five long, and duplicate slugs', async () => {
    const id = await insertBook()
    await expect(
      database.sql`update books set rating_counts = '{1,2}' where id = ${id}`,
    ).rejects.toThrow(/books_rating_counts_check/)
    await expect(insertBook('dune-0192a3', 'Other')).rejects.toThrow(/books_slug_unique/)
  })

  it('keeps isbn_13 unique when present and allows many Editions without one', async () => {
    const bookId = await insertBook()
    const add = (isbn: string | null) => database.sql`
      insert into editions (id, book_id, isbn_13) values (uuidv7(), ${bookId}, ${isbn})`
    await add(null)
    await add(null)
    await add('9780441172719')
    await expect(add('9780441172719')).rejects.toThrow(/editions_isbn_13_unique/)
    await expect(add('12345')).rejects.toThrow(/editions_isbn_13_check/)
  })

  it('defaults an Edition format to unknown and rejects a bad one', async () => {
    const bookId = await insertBook()
    const [row] = await database.sql`
      insert into editions (id, book_id) values (uuidv7(), ${bookId}) returning format`
    expect(row?.format).toBe('unknown')
    await expect(
      database.sql`insert into editions (id, book_id, format) values (uuidv7(), ${bookId}, 'scroll')`,
    ).rejects.toThrow(/editions_format_check/)
  })

  it('uses (book, author, role) as the Contribution key and checks the role', async () => {
    const bookId = await insertBook()
    const authorId = await insertAuthor()
    const add = (role: string) => database.sql`
      insert into contributions (book_id, author_id, role) values (${bookId}, ${authorId}, ${role})`
    await add('author')
    await add('translator')
    await expect(add('author')).rejects.toThrow(/contributions_book_id_author_id_role_pk/)
    await expect(add('ghostwriter')).rejects.toThrow(/contributions_role_check/)
  })

  it('makes a Source link unique on (source, entity_type, source_id)', async () => {
    const a = await insertBook()
    const b = await insertBook('other-0192a5', 'Other')
    const link = (entityId: string, entityType = 'book') => database.sql`
      insert into source_links (id, entity_type, entity_id, source, source_id)
      values (uuidv7(), ${entityType}, ${entityId}, 'open_library', 'X1')`
    await link(a)
    await expect(link(b)).rejects.toThrow(/source_links_source_entity_type_source_id_idx/)
    await link(b, 'author')
    await expect(link(b, 'shelf')).rejects.toThrow(/source_links_entity_type_check/)
  })

  it('cascades Editions and Contributions when a Book row is removed', async () => {
    const bookId = await insertBook()
    const authorId = await insertAuthor()
    await database.sql`insert into editions (id, book_id) values (uuidv7(), ${bookId})`
    await database.sql`
      insert into contributions (book_id, author_id, role) values (${bookId}, ${authorId}, 'author')`
    await database.sql`delete from books where id = ${bookId}`
    const [e] = await database.sql`select count(*)::int as n from editions`
    const [c] = await database.sql`select count(*)::int as n from contributions`
    expect([e?.n, c?.n]).toEqual([0, 0])
  })

  it('has a GIN index on search_vector and trigram indexes on title and Author name', async () => {
    const rows = await database.sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef from pg_indexes where schemaname = 'public'`
    const def = (name: string) => rows.find((r) => r.indexname === name)?.indexdef ?? ''
    expect(def('books_search_vector_idx')).toMatch(/USING gin \(search_vector\)/)
    expect(def('books_title_trgm_idx')).toMatch(/USING gin \(title gin_trgm_ops\)/)
    expect(def('authors_name_trgm_idx')).toMatch(/USING gin \(name gin_trgm_ops\)/)
  })

  it('finds a Book by a misspelled title through the trigram operator', async () => {
    await insertBook('the-left-hand-of-darkness-0192a3', 'The Left Hand of Darkness')
    const rows = await database.sql`
      select id from books where title % 'left hand of darknes'`
    expect(rows).toHaveLength(1)
  })
})
