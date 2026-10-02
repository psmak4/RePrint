import { type Database, genres } from '@reprint/db'
import {
  type BookSummary,
  GENRE_PAGE_SIZE,
  type GenreLink,
  type GenreNode,
  type GenreSort,
  WEIGHTED_RATING_C,
} from '@reprint/shared'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { loadBookSummaries } from './read.js'

type GenreRow = typeof genres.$inferSelect

export async function findGenreBySlug(db: Database, slug: string): Promise<GenreRow | null> {
  const [row] = await db
    .select()
    .from(genres)
    .where(and(eq(genres.slug, slug), isNull(genres.archivedAt)))
    .limit(1)
  return row ?? null
}

/** Every Genre as a tree: roots first, each level sorted by name. */
export async function loadGenreTree(db: Database): Promise<GenreNode[]> {
  const rows = await db
    .select()
    .from(genres)
    .where(isNull(genres.archivedAt))
    .orderBy(asc(genres.name), asc(genres.id))
  const nodes = new Map<string, GenreNode>(
    rows.map((row) => [
      row.id,
      {
        slug: row.slug,
        name: row.name,
        description: row.description,
        featured: row.featured,
        children: [],
      },
    ]),
  )
  const roots: GenreNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)
    if (!node) continue
    const parent = row.parentId ? nodes.get(row.parentId) : undefined
    // `parent_id` can't point at a Genre that doesn't exist, so a missing parent means a root.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export async function loadGenreLinks(
  db: Database,
  genre: GenreRow,
): Promise<{ parent: GenreLink | null; children: GenreLink[] }> {
  const [parentRow, childRows] = await Promise.all([
    genre.parentId
      ? db
          .select({ slug: genres.slug, name: genres.name })
          .from(genres)
          .where(eq(genres.id, genre.parentId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ slug: genres.slug, name: genres.name })
      .from(genres)
      .where(and(eq(genres.parentId, genre.id), isNull(genres.archivedAt)))
      .orderBy(asc(genres.name), asc(genres.id)),
  ])
  return { parent: parentRow[0] ?? null, children: childRows }
}

/**
 * Ties after the sort key go to the more reviewed Book, then the Book ID, so pages never overlap.
 * `top_rated` is the weighted average `(C × m + Σ ratings) / (C + n)` (PRD §7.6) with `m` the
 * site-wide mean over every Book (D-133); `newest_review` is the latest Approved review decision.
 */
function orderBy(sort: GenreSort) {
  switch (sort) {
    case 'most_reviewed':
      return sql`b.review_count desc, b.id`
    case 'newest_review':
      return sql`(select max(r.decided_at) from reviews r
        where r.book_id = b.id and r.status = 'approved' and r.hidden_at is null) desc nulls last, b.review_count desc, b.id`
    default:
      return sql`((${WEIGHTED_RATING_C}::float8 * site.mean + b.rating_sum) / (${WEIGHTED_RATING_C} + b.review_count)) desc,
        b.review_count desc, b.id`
  }
}

/** One page of Books in the Genre or any Genre below it. */
export async function loadGenreBooks(
  db: Database,
  genre: GenreRow,
  { sort, page }: { sort: GenreSort; page: number },
): Promise<{ items: BookSummary[]; hasMore: boolean }> {
  const rows = await db.execute<{ id: string }>(sql`
    with recursive tree as (
      select id from genres where id = ${genre.id}
      union
      select g.id from genres g join tree t on g.parent_id = t.id
    ),
    site as (
      select coalesce(sum(rating_sum)::float8 / nullif(sum(review_count), 0), 0) as mean from books
    )
    select b.id from books b, site
    where exists (select 1 from book_genres bg where bg.book_id = b.id
                  and bg.genre_id in (select id from tree))
    order by ${orderBy(sort)}
    limit ${GENRE_PAGE_SIZE + 1} offset ${(page - 1) * GENRE_PAGE_SIZE}`)
  const ids = rows.map((row) => row.id)
  return {
    items: await loadBookSummaries(db, ids.slice(0, GENRE_PAGE_SIZE)),
    hasMore: ids.length > GENRE_PAGE_SIZE,
  }
}
