import {
  bookGenres,
  bookSubjects,
  books,
  type Database,
  editions,
  subjectGenreRules,
  subjects,
} from '@reprint/db'
import type { FieldOrigins } from '@reprint/shared'
import { and, eq, notInArray } from 'drizzle-orm'
import { isLocked } from '../ingest/fields.js'
import { mapSubjectsToGenres } from './genres.js'
import { choosePrimaryEdition } from './primary-edition.js'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Sets the Primary Edition unless an admin locked it (`primaryEdition`). Returns the chosen ID. */
async function applyPrimaryEdition(tx: Tx, bookId: string): Promise<string | null> {
  const list = await tx
    .select({
      id: editions.id,
      language: editions.language,
      coverId: editions.coverId,
      isbn13: editions.isbn13,
      publishedDate: editions.publishedDate,
    })
    .from(editions)
    .where(eq(editions.bookId, bookId))
  const chosen = choosePrimaryEdition(list)
  await tx.update(books).set({ primaryEditionId: chosen }).where(eq(books.id, bookId))
  return chosen
}

/**
 * Replaces the Book's mapped Genres with those its Subjects map to. Admin rows are never removed or
 * changed (PRD §5.4). Returns the mapped Genre IDs.
 */
async function applyGenreMapping(tx: Tx, bookId: string): Promise<string[]> {
  const labels = await tx
    .select({ label: subjects.label })
    .from(bookSubjects)
    .innerJoin(subjects, eq(subjects.id, bookSubjects.subjectId))
    .where(eq(bookSubjects.bookId, bookId))
    .orderBy(subjects.label)
  const rules = await tx.select().from(subjectGenreRules)
  const genreIds = mapSubjectsToGenres(
    labels.map((row) => row.label),
    rules,
  )
  const stale = and(eq(bookGenres.bookId, bookId), eq(bookGenres.origin, 'mapping'))
  await tx
    .delete(bookGenres)
    .where(genreIds.length > 0 ? and(stale, notInArray(bookGenres.genreId, genreIds)) : stale)
  if (genreIds.length > 0) {
    await tx
      .insert(bookGenres)
      .values(genreIds.map((genreId) => ({ bookId, genreId, origin: 'mapping' as const })))
      .onConflictDoNothing()
  }
  return genreIds
}

/**
 * Derived Catalog data for one Book, computed inside the ingest transaction: the Primary Edition
 * (skipped when an admin locked `primaryEdition`) and the Genres mapped from Subjects (skipped when
 * an admin locked `genres`).
 */
export async function enrichBook(
  tx: Tx,
  book: { id: string; lockedFields: readonly string[]; origins: FieldOrigins },
): Promise<void> {
  if (!isLocked('primaryEdition', book.lockedFields, book.origins)) {
    await applyPrimaryEdition(tx, book.id)
  }
  if (!isLocked('genres', book.lockedFields, book.origins)) {
    await applyGenreMapping(tx, book.id)
  }
}
