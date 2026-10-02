import { books, type Database, reviews, type SeedRandom, shelfEntries, users } from '@reprint/db'
import { SHELVES } from '@reprint/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { DAY_MS, loadSeedAccounts } from '../reviews/seed-reviews.js'

/** One number drives the library sample data, so two seeds create the same rows. */
export const LIBRARIES_SEED = 20260105

/** Members who get a Library, in username order (the reviewers of the review seed). */
const MEMBERS_WITH_LIBRARIES = 14
/** The first few of them keep their Library private; the rest are public. */
const PRIVATE_LIBRARIES = 4
/** Books with reviews come first in slug order; the pool reaches past them to unreviewed Books. */
const BOOK_POOL = 120
const REVIEWED_PER_MEMBER = [2, 4] as const
const UNREVIEWED_PER_MEMBER = [4, 9] as const

export interface SeedLibrariesResult {
  members: number
  entries: number
  privateLibraries: number
  skipped: boolean
}

/**
 * Gives seeded Members Libraries across all three Shelves, with some private. Each Library holds
 * Books the Member reviewed (on any Shelf) and Books they did not, because a Shelf entry does not
 * depend on a review (PRD §7.7). Does nothing when any Shelf entry exists. Needs the users,
 * Catalog, and review seeds to have run first.
 */
export async function seedLibraries(
  db: Database,
  random: SeedRandom,
  log: (message: string) => void = () => {},
): Promise<SeedLibrariesResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: shelfEntries.id }).from(shelfEntries).limit(1)
    if (existing) {
      log('library seed: Shelf entries already exist, nothing to do')
      return { members: 0, entries: 0, privateLibraries: 0, skipped: true }
    }

    const { reviewers } = await loadSeedAccounts(tx)
    const members = reviewers.slice(0, MEMBERS_WITH_LIBRARIES)
    const pool = await tx
      .select({ id: books.id })
      .from(books)
      .orderBy(asc(books.slug))
      .limit(BOOK_POOL)
    if (members.length < MEMBERS_WITH_LIBRARIES || pool.length === 0) {
      throw new Error('library seed needs the users, Catalog, and review seeds to have run first')
    }
    const memberIds = members.map((member) => member.id)
    const reviewed = await tx
      .select({ userId: reviews.userId, bookId: reviews.bookId })
      .from(reviews)
      .where(inArray(reviews.userId, memberIds))

    const now = random.now().getTime()
    const rows: (typeof shelfEntries.$inferInsert)[] = []
    for (const [index, member] of members.entries()) {
      const reviewedIds = new Set(
        reviewed.filter((row) => row.userId === member.id).map((row) => row.bookId),
      )
      const mine = pool.filter((book) => reviewedIds.has(book.id))
      const others = pool.filter((book) => !reviewedIds.has(book.id))
      const chosen = [
        ...take(random, mine, random.int(REVIEWED_PER_MEMBER[0], REVIEWED_PER_MEMBER[1])),
        ...take(random, others, random.int(UNREVIEWED_PER_MEMBER[0], UNREVIEWED_PER_MEMBER[1])),
      ]
      // Cycling from a random start puts every Shelf in each Library.
      const start = random.int(0, SHELVES.length - 1)
      for (const [position, book] of chosen.entries()) {
        const addedAt = new Date(now - random.int(1, 300) * DAY_MS)
        rows.push({
          userId: member.id,
          bookId: book.id,
          shelf: SHELVES[(start + position) % SHELVES.length] ?? 'read',
          addedAt,
          updatedAt: addedAt,
        })
      }
      await tx
        .update(users)
        .set({ libraryPublic: index >= PRIVATE_LIBRARIES })
        .where(eq(users.id, member.id))
    }
    await tx.insert(shelfEntries).values(rows)

    log(`library seed: ${rows.length} Shelf entries for ${members.length} Members`)
    return {
      members: members.length,
      entries: rows.length,
      privateLibraries: PRIVATE_LIBRARIES,
      skipped: false,
    }
  })
}

/** Removes and returns up to `count` random items. */
function take<T>(random: SeedRandom, items: T[], count: number): T[] {
  const left = [...items]
  const out: T[] = []
  while (out.length < count && left.length > 0) {
    const item = left.splice(random.int(0, left.length - 1), 1)[0]
    if (item !== undefined) out.push(item)
  }
  return out
}
