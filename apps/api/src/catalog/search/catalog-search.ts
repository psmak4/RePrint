import type { Database } from '@reprint/db'
import { SEARCH_MIN_LENGTH, type SearchSort, toIsbn13 } from '@reprint/shared'
import { sql } from 'drizzle-orm'

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

/** The query as typed, lowercased and unaccented in SQL, for trigram comparison. */
function normalizedQuery(q: string) {
  return sql`lower(unaccent(${q.trim()}))`
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
 * Full-text and trigram search over Book titles, subtitles, Author names, Series names, and ISBNs
 * (PRD §6). Full text (accent-insensitive, through the unaccented search vector) finds words and
 * prefixes; trigrams catch typos in titles, Author names, and Series names. Never calls a Source.
 */
export async function searchCatalogBooks(
  db: Database,
  { q, limit, offset = 0, filters = {}, sort = 'relevance' }: CatalogSearchInput,
): Promise<SearchHit[]> {
  const tsText = toTsQueryText(q)
  if (q.trim().length < SEARCH_MIN_LENGTH || !tsText) return []
  const qn = normalizedQuery(q)
  const rows = await db.execute<{ id: string; score: number }>(sql`
    with query as (
      select to_tsquery('simple', unaccent(${tsText})) as tsq, ${qn} as qn
    ),
    matched_authors as (
      select a.id from authors a, query
      where word_similarity(query.qn, lower(unaccent(a.name))) >= ${NAME_WORD_THRESHOLD}
    ),
    matched_series as (
      select s.id from series s, query
      where word_similarity(query.qn, lower(unaccent(s.name))) >= ${NAME_WORD_THRESHOLD}
    )
    select b.id,
      (ts_rank_cd(b.search_vector, query.tsq)
        + similarity(lower(unaccent(b.title)), query.qn))::float8 as score
    from books b, query
    where (b.search_vector @@ query.tsq
      or similarity(lower(unaccent(b.title)), query.qn) >= ${TRIGRAM_THRESHOLD}
      or exists (select 1 from contributions c
                 where c.book_id = b.id and c.author_id in (select id from matched_authors))
      or exists (select 1 from book_series bs
                 where bs.book_id = b.id and bs.series_id in (select id from matched_series)))
      ${filterClauses(filters)}
    order by ${orderBy(sort)}
    limit ${limit} offset ${offset}`)
  return rows.map((row) => ({ id: row.id, score: Number(row.score) }))
}

/** Authors whose name (or another name they use) contains the query, or is close to it. */
export async function searchCatalogAuthors(
  db: Database,
  { q, limit, offset = 0 }: CatalogSearchInput,
): Promise<SearchHit[]> {
  const words = searchTokens(q)
  if (q.trim().length < SEARCH_MIN_LENGTH || words.length === 0) return []
  const qn = normalizedQuery(q)
  const contains = `%${likeEscape(words.join(' '))}%`
  const rows = await db.execute<{ id: string; score: number }>(sql`
    with query as (select ${qn} as qn),
    names as (
      select a.id, lower(unaccent(a.name)) as name,
        lower(unaccent(array_to_string(a.alternate_names, ' '))) as alternates
      from authors a
    )
    select n.id,
      (greatest(similarity(n.name, query.qn), word_similarity(query.qn, n.name))
        + case when n.name like ${contains} then 1 else 0 end)::float8 as score
    from names n, query
    where n.name like ${contains}
      or n.alternates like ${contains}
      or word_similarity(query.qn, n.name) >= ${NAME_WORD_THRESHOLD}
    order by score desc, n.name, n.id
    limit ${limit} offset ${offset}`)
  return rows.map((row) => ({ id: row.id, score: Number(row.score) }))
}
