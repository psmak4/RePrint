import type { Database } from '@reprint/db'
import { excerptOf, type ReviewExcerpt } from '@reprint/shared'
import { sql } from 'drizzle-orm'

/**
 * Reviews that may be excerpted on Discover and in search (D-177): Approved, not auto-hidden
 * (D-040), no spoilers, and written by a Member whose account still exists (D-043). Anything the
 * Book page's review list would not show is left out, and so is anything needing a spoiler toggle.
 */
export const EXCERPTABLE_REVIEW = sql`r.status = 'approved' and r.hidden_at is null
  and r.has_spoilers = false
  and not exists (select 1 from users u where u.id = r.user_id and u.status = 'deleted')`

export interface ExcerptRow extends Record<string, unknown> {
  id: string
  book_id: string
  rating: number
  headline: string | null
  body: string
  username: string
  display_name: string
  approved_at: Date | string
}

/** The SQL columns every excerpt query selects, with `r` the review and `au` its author. */
export const EXCERPT_COLUMNS = sql`r.id, r.book_id, r.rating, r.headline, r.body,
  au.username, au.display_name, coalesce(r.decided_at, r.submitted_at) as approved_at`

export function toExcerpt(row: ExcerptRow): ReviewExcerpt {
  return {
    id: row.id,
    rating: row.rating,
    headline: row.headline,
    excerpt: excerptOf(row.body),
    author: { username: row.username, displayName: row.display_name },
    approvedAt: new Date(row.approved_at).toISOString(),
  }
}

/**
 * Each given Book's most helpful excerptable review, ties to the newest. Books with none are
 * absent from the map.
 */
export async function loadTopReviews(
  db: Database,
  bookIds: string[],
): Promise<Map<string, ReviewExcerpt>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db.execute<ExcerptRow>(
    sql`select distinct on (r.book_id) ${EXCERPT_COLUMNS}
      from reviews r join users au on au.id = r.user_id
      where r.book_id in (${sql.join(
        bookIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and ${EXCERPTABLE_REVIEW}
      order by r.book_id, r.helpful_count desc,
               coalesce(r.decided_at, r.submitted_at) desc, r.id`,
  )
  return new Map(rows.map((row) => [row.book_id, toExcerpt(row)]))
}
