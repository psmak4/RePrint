import { SHELVES } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { users } from './accounts.js'
import { books } from './catalog.js'
import { timestamptz, uuidv7Pk } from './helpers.js'

/**
 * A Book on a Member's Shelf (PRD §5.3, §9): one entry per Member per Book, so choosing another
 * Shelf updates the row. Both FKs cascade, so an erased account or Book takes its entries along.
 * Independent of reviews: nothing here reads or writes `reviews`.
 */
export const shelfEntries = pgTable(
  'shelf_entries',
  {
    id: uuidv7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    shelf: text('shelf', { enum: SHELVES }).notNull(),
    addedAt: timestamptz('added_at').notNull().default(sql`now()`),
    updatedAt: timestamptz('updated_at').notNull().default(sql`now()`),
  },
  (t) => [
    // The unique index also serves a Member's library lookups (user first).
    unique('shelf_entries_user_id_book_id_unique').on(t.userId, t.bookId),
    index('shelf_entries_book_id_idx').on(t.bookId),
    check('shelf_entries_shelf_check', sql`${t.shelf} in ('want_to_read', 'reading', 'read')`),
  ],
)

export type ShelfEntry = typeof shelfEntries.$inferSelect
