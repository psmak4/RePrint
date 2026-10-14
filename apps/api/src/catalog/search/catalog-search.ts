import type { Database } from '@reprint/db'
import { SEARCH_MIN_LENGTH, type SearchSort, toIsbn13 } from '@reprint/shared'
import { type SQL, sql } from 'drizzle-orm'

/** A Book or Author that matched, with a relevance score (higher is better). */
export interface SearchHit {
  id: string
  score: number
}

/** Limits that only the Catalog can apply; Source results have no Genres or ratings (PRD §7.3). */
export interface CatalogBookFilters {
  /** A Genre slug; Books in its child Genres match too. */
  genre?: string
  /** A language code; Books with an Edition in it match. */
  language?: string
  /** First year of a decade, such as 1990. */
  decade?: number
  /** Whole stars; the Book's average must reach it. */
  minRating?: number
}

export interface CatalogSearchInput {
  q: string
  limit: number
  offset?: number
  filters?: CatalogBookFilters
  sort?: SearchSort
}

/** Below this, a title is too different from the query to count as a typo of it. */
const TRIGRAM_THRESHOLD = 0.3
/** Below this, no word of a name is close enough to the query to count as a typo of it. */
const NAME_WORD_THRESHOLD = 0.45

/** What a search query runs on: the database, or the transaction that holds the thresholds. */
type Executor = Pick<Database, 'execute'>

/** Lowercase words of letters and digits; punctuation and operators never reach the tsquery. */
export function searchTokens(q: string): string[] {
  return q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * A query in `to_tsquery` syntax: every word must match, and the last one also matches as a prefix
 * so results appear while typing. An ISBN (10 or 13 digits, with or without hyphens) becomes its
 * ISBN-13, which is how ISBNs are stored in the search vector. Null when nothing is searchable.
 */
export function toTsQueryText(q: string): string | null {
  const isbn = toIsbn13(q)
  const tokens = isbn ? [isbn] : searchTokens(q)
  if (tokens.length === 0) return null
  return tokens.map((token, i) => (i === tokens.length - 1 ? `${token}:*` : token)).join(' & ')
}

/** The query as typed, folded (lowercased and unaccented) in SQL like the indexed text. */
function normalizedQuery(q: string) {
  return sql`search_fold(${q.trim()})`
}

/**
 * Runs a search with the trigram thresholds set for its transaction only, so the `%` and `<%`
 * operators the indexes serve match at exactly these thresholds (M10-T01). `set_config(…, true)`
 * ends with the transaction, so a pooled connection never carries it to another request.
 */
export function withSearchThresholds<T>(
  db: Database,
  run: (tx: Executor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('pg_trgm.similarity_threshold', ${String(TRIGRAM_THRESHOLD)}, true),
      set_config('pg_trgm.word_similarity_threshold', ${String(NAME_WORD_THRESHOLD)}, true)`)
    return run(tx)
  })
}

/** Escapes `%`, `_`, and `\` so user text is matched literally by LIKE. */
function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** `and ...` clauses for each filter that is set; every value reaches SQL as a bind parameter. */
function filterClauses({ genre, language, decade, minRating }: CatalogBookFilters) {
  const clauses = []
  if (genre) {
    clauses.push(sql`and exists (
      select 1 from book_genres bg join genres g on g.id = bg.genre_id
      where bg.book_id = b.id
        and (g.slug = ${genre} or g.parent_id = (select id from genres where slug = ${genre})))`)
  }
  if (language) {
    clauses.push(sql`and exists (
      select 1 from editions e where e.book_id = b.id and e.language = ${language})`)
  }
  if (decade !== undefined) {
    clauses.push(
      sql`and b.first_published_year >= ${decade} and b.first_published_year < ${decade + 10}`,
    )
  }
  if (minRating !== undefined) {
    clauses.push(
      sql`and b.review_count > 0 and b.rating_sum::float8 / b.review_count >= ${minRating}`,
    )
  }
  return sql.join(clauses, sql` `)
}

/** Relevance first by default; the other sorts use it, then the Book ID, to break ties. */
function orderBy(sort: SearchSort) {
  switch (sort) {
    case 'most_reviewed':
      return sql`b.review_count desc, score desc, b.id`
    case 'highest_rated':
      return sql`(case when b.review_count > 0 then b.rating_sum::float8 / b.review_count end) desc nulls last,
        b.review_count desc, score desc, b.id`
    case 'newest':
      return sql`b.first_published_year desc nulls last, score desc, b.id`
    default:
      return sql`score desc, b.review_count desc, b.id`
  }
}

/**
 * The Book search: full text and trigrams over Book titles, subtitles, Author names, Series names,
 * and ISBNs (PRD §6). Full text (accent-insensitive, through the unaccented search vector) finds
 * words and prefixes; trigrams catch typos in titles, Author names, and Series names. Each kind of
 * match gathers its Books through its own index, and the union is ranked. Null when nothing is
 * searchable. Run it with `withSearchThresholds`.
 */
export function bookSearchQuery({
  q,
  limit,
  offset = 0,
  filters = {},
  sort = 'relevance',
}: CatalogSearchInput): SQL | null {
  const tsText = toTsQueryText(q)
  if (q.trim().length < SEARCH_MIN_LENGTH || !tsText) return null
  const qn = normalizedQuery(q)
  return sql`
    with query as (
      select to_tsquery('simple', unaccent(${tsText})) as tsq, ${qn} as qn
    ),
    matched_authors as (
      select a.id from authors a, query where query.qn <% search_fold(a.name)
    ),
    matched_series as (
      select s.id from series s, query where query.qn <% search_fold(s.name)
    ),
    matched as (
      select b.id from books b, query where b.search_vector @@ query.tsq
      union
      select b.id from books b, query where search_fold(b.title) % query.qn
      union
      select c.book_id from contributions c where c.author_id in (select id from matched_authors)
      union
      select bs.book_id from book_series bs where bs.series_id in (select id from matched_series)
    )
    select b.id,
      (ts_rank_cd(b.search_vector, query.tsq)
        + similarity(search_fold(b.title), query.qn))::float8 as score
    from matched m join books b on b.id = m.id, query
    where true
      ${filterClauses(filters)}
    order by ${orderBy(sort)}
    limit ${limit} offset ${offset}`
}

/** Catalog Books matching the query, best first (see `bookSearchQuery`). Never calls a Source. */
export async function searchCatalogBooks(
  db: Database,
  input: CatalogSearchInput,
): Promise<SearchHit[]> {
  const query = bookSearchQuery(input)
  if (!query) return []
  const rows = await withSearchThresholds(db, (tx) =>
    tx.execute<{ id: string; score: number }>(query),
  )
  return rows.map((row) => ({ id: row.id, score: Number(row.score) }))
}

/**
 * The Author search: names (or other names they use) that contain the query, or have a word close
 * to it, each kind gathered through its own index. Null when nothing is searchable. Run it with
 * `withSearchThresholds`.
 */
export function authorSearchQuery({ q, limit, offset = 0 }: CatalogSearchInput): SQL | null {
  const words = searchTokens(q)
  if (q.trim().length < SEARCH_MIN_LENGTH || words.length === 0) return null
  const qn = normalizedQuery(q)
  const contains = `%${likeEscape(words.join(' '))}%`
  return sql`
    with query as (select ${qn} as qn),
    matched as (
      select a.id from authors a where search_fold(a.name) like ${contains}
      union
      select a.id from authors a where search_fold_names(a.alternate_names) like ${contains}
      union
      select a.id from authors a, query where query.qn <% search_fold(a.name)
    ),
    names as (
      select a.id, search_fold(a.name) as name from matched m join authors a on a.id = m.id
    )
    select n.id,
      (greatest(similarity(n.name, query.qn), word_similarity(query.qn, n.name))
        + case when n.name like ${contains} then 1 else 0 end)::float8 as score
    from names n, query
    order by score desc, n.name, n.id
    limit ${limit} offset ${offset}`
}

/** Authors whose name (or another name they use) contains the query, or is close to it. */
export async function searchCatalogAuthors(
  db: Database,
  input: CatalogSearchInput,
): Promise<SearchHit[]> {
  const query = authorSearchQuery(input)
  if (!query) return []
  const rows = await withSearchThresholds(db, (tx) =>
    tx.execute<{ id: string; score: number }>(query),
  )
  return rows.map((row) => ({ id: row.id, score: Number(row.score) }))
}
