import { FEATURED_KINDS } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { timestamptz, uuidv7Pk } from './helpers.js'

/**
 * The Discover page's picks (PRD §9): featured Genres and the featured review. `ref_id` points at
 * a Genre or a Review depending on `kind`, so it has no foreign key (D-135); the row builders skip
 * picks whose target is gone or no longer eligible.
 */
export const featuredItems = pgTable(
  'featured_items',
  {
    id: uuidv7Pk(),
    kind: text('kind', { enum: FEATURED_KINDS }).notNull(),
    refId: uuid('ref_id').notNull(),
    /** Display order within the kind, lowest first. */
    position: integer('position').notNull().default(0),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    // One pick per target; the index also serves lookups by kind.
    unique('featured_items_kind_ref_id_unique').on(t.kind, t.refId),
    check('featured_items_kind_check', sql`${t.kind} in ('genre', 'review')`),
  ],
)

export type FeaturedItem = typeof featuredItems.$inferSelect
