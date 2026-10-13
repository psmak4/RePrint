import { authors, books, type Database } from '@reprint/db'
import { fieldOriginsSchema } from '@reprint/shared'
import { and, asc, eq, gt, isNotNull } from 'drizzle-orm'

type Cleaners = Readonly<Record<string, (raw: string) => string | null>>

/** Rows read per round, so a large Catalog is never held in memory at once. */
const BATCH = 500

/** The cleaner for a stored field, or `null` when an admin set it or no known Source did. */
function cleanerFor(
  cleaners: Cleaners,
  origins: unknown,
  field: string,
): ((raw: string) => string | null) | null {
  const parsed = fieldOriginsSchema.safeParse(origins)
  const source = parsed.success ? parsed.data[field]?.source : undefined
  return source ? (cleaners[source] ?? null) : null
}

/**
 * Reads stored Book descriptions and Author bios again with each Source's current rules (D-202), so
 * text imported before them reads as a new import would. Skips text an admin set or locked, and text
 * from a Source with no cleaner. Safe to run again: unchanged text is not written. Returns how many
 * rows changed.
 */
export async function cleanStoredMarkup(
  db: Database,
  cleaners: Cleaners,
): Promise<{ books: number; authors: number }> {
  let bookCount = 0
  for (let after = ''; ; ) {
    const rows = await db
      .select({
        id: books.id,
        description: books.description,
        fieldOrigins: books.fieldOrigins,
        lockedFields: books.lockedFields,
      })
      .from(books)
      .where(and(isNotNull(books.description), after ? gt(books.id, after) : undefined))
      .orderBy(asc(books.id))
      .limit(BATCH)
    for (const row of rows) {
      if (row.lockedFields.includes('description') || row.description === null) continue
      const clean = cleanerFor(cleaners, row.fieldOrigins, 'description')
      if (!clean) continue
      const description = clean(row.description)
      if (description === row.description) continue
      await db.update(books).set({ description }).where(eq(books.id, row.id))
      bookCount += 1
    }
    const last = rows.at(-1)
    if (!last || rows.length < BATCH) break
    after = last.id
  }

  let authorCount = 0
  for (let after = ''; ; ) {
    const rows = await db
      .select({ id: authors.id, bio: authors.bio, fieldOrigins: authors.fieldOrigins })
      .from(authors)
      .where(and(isNotNull(authors.bio), after ? gt(authors.id, after) : undefined))
      .orderBy(asc(authors.id))
      .limit(BATCH)
    for (const row of rows) {
      if (row.bio === null) continue
      const clean = cleanerFor(cleaners, row.fieldOrigins, 'bio')
      if (!clean) continue
      const bio = clean(row.bio)
      if (bio === row.bio) continue
      await db.update(authors).set({ bio }).where(eq(authors.id, row.id))
      authorCount += 1
    }
    const last = rows.at(-1)
    if (!last || rows.length < BATCH) break
    after = last.id
  }

  return { books: bookCount, authors: authorCount }
}
