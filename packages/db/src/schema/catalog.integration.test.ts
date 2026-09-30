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

describe('catalog schema (part 2)', () => {
  it('creates every table', async () => {
    const rows = await database.sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public'`
    const names = rows.map((r) => r.tablename)
    for (const table of [
      'series',
      'book_series',
      'genres',
      'book_genres',
      'subjects',
      'book_subjects',
      'subject_genre_rules',
      'merge_candidates',
    ]) {
      expect(names).toContain(table)
    }
  })

  it('loads about 40 Genres, the ★-marked ones featured, with Dystopian under Science Fiction', async () => {
    const [count] = await database.sql`select count(*)::int as n from genres`
    const [featured] = await database.sql`select count(*)::int as n from genres where featured`
    expect(count?.n).toBe(42)
    expect(featured?.n).toBe(13)
    const [dystopian] = await database.sql`
      select p.slug as parent from genres g join genres p on p.id = g.parent_id
      where g.slug = 'dystopian'`
    expect(dystopian?.parent).toBe('science-fiction')
  })

  it('loads starter mapping rules where history ranks below specific fiction rules', async () => {
    const rules = await database.sql<{ pattern: string; slug: string; priority: number }[]>`
      select r.pattern, g.slug, r.priority from subject_genre_rules r join genres g on g.id = r.genre_id`
    expect(rules.length).toBeGreaterThan(80)
    const priority = (pattern: string) => rules.find((r) => r.pattern === pattern)?.priority ?? 0
    expect(priority('historical fiction')).toBeGreaterThan(priority('history'))
    expect(rules.find((r) => r.pattern === 'space opera')?.slug).toBe('science-fiction')
  })

  it('keeps Genre slugs and rule (pattern, Genre) pairs unique', async () => {
    await expect(
      database.sql`insert into genres (id, slug, name) values (uuidv7(), 'fantasy', 'Fantasy 2')`,
    ).rejects.toThrow(/genres_slug_unique/)
    await expect(
      database.sql`
        insert into subject_genre_rules (id, pattern, genre_id)
        select uuidv7(), 'fantasy', id from genres where slug = 'fantasy'`,
    ).rejects.toThrow(/subject_genre_rules_pattern_genre_id_unique/)
  })

  it('stores Series positions as decimals or empty', async () => {
    const bookId = await insertBook()
    const [s] = await database.sql<{ id: string }[]>`
      insert into series (id, slug, name) values (uuidv7(), 'the-expanse-0192b1', 'The Expanse')
      returning id`
    const seriesId = s?.id ?? ''
    await database.sql`insert into book_series (book_id, series_id, position) values (${bookId}, ${seriesId}, 2.5)`
    const [row] = await database.sql`select position::float8 as position from book_series`
    expect(row?.position).toBe(2.5)
    await database.sql`update book_series set position = null`
    await expect(database.sql`update book_series set position = -1`).rejects.toThrow(
      /book_series_position_check/,
    )
  })

  it('keeps Subject labels unique case-insensitively', async () => {
    const add = (label: string) => database.sql`
      insert into subjects (id, label) values (uuidv7(), ${label})`
    await add('Space warfare')
    await expect(add('space WARFARE')).rejects.toThrow(/subjects_label_unique/)
  })

  it('tracks whether a Book Genre came from a mapping or an admin', async () => {
    const bookId = await insertBook()
    const [g] = await database.sql<{ id: string }[]>`select id from genres where slug = 'classics'`
    const genreId = g?.id ?? ''
    await database.sql`insert into book_genres (book_id, genre_id) values (${bookId}, ${genreId})`
    const [row] = await database.sql`select origin from book_genres`
    expect(row?.origin).toBe('mapping')
    await expect(database.sql`update book_genres set origin = 'source'`).rejects.toThrow(
      /book_genres_origin_check/,
    )
  })

  it('records a merge candidate once per pair and never pairs a Book with itself', async () => {
    const a = await insertBook()
    const b = await insertBook('dune-messiah-0192a6', 'Dune Messiah')
    const add = (x: string, y: string) => database.sql`
      insert into merge_candidates (id, book_a_id, book_b_id, reason)
      values (uuidv7(), ${x}, ${y}, 'same title and author')`
    await add(a, b)
    await expect(add(a, b)).rejects.toThrow(/merge_candidates_pair_unique/)
    await expect(add(a, a)).rejects.toThrow(/merge_candidates_distinct_check/)
    const [row] = await database.sql`select status from merge_candidates`
    expect(row?.status).toBe('pending')
  })

  it('indexes every foreign key on the new tables', async () => {
    const rows = await database.sql<{ tbl: string; col: string }[]>`
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.conrelid::regclass::text in ('book_series','book_genres','book_subjects','genres',
          'subject_genre_rules','merge_candidates')
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`
    expect(rows).toEqual([])
  })
})
