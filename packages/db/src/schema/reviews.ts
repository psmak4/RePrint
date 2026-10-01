import { REVIEW_STATUSES } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './accounts.js'
import { books, editions } from './catalog.js'
import { timestamps, timestamptz, uuidv7Pk } from './helpers.js'

/**
 * A Review (PRD §5.3, §9). Reviews are Member data, so `book_id` is RESTRICT (D-094: a Book
 * with reviews cannot be deleted) and `user_id` cascades so `accounts.erase` needs one delete.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuidv7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    headline: text('headline'),
    body: text('body').notNull(),
    hasSpoilers: boolean('has_spoilers').notNull().default(false),
    editionId: uuid('edition_id').references(() => editions.id, { onDelete: 'set null' }),
    status: text('status', { enum: REVIEW_STATUSES }).notNull().default('pending'),
    /** M5 keeps this in step with `helpful_votes`. */
    helpfulCount: integer('helpful_count').notNull().default(0),
    /** When the current content was submitted (new or edited). */
    submittedAt: timestamptz('submitted_at').notNull().default(sql`now()`),
    /** When a Moderator last decided this Review; null while Pending. */
    decidedAt: timestamptz('decided_at'),
    ...timestamps(),
  },
  (t) => [
    unique('reviews_user_id_book_id_unique').on(t.userId, t.bookId),
    index('reviews_book_id_status_idx').on(t.bookId, t.status),
    index('reviews_edition_id_idx').on(t.editionId),
    // The moderation queue: Pending reviews, oldest first.
    index('reviews_pending_queue_idx').on(t.submittedAt).where(sql`${t.status} = 'pending'`),
    check('reviews_rating_check', sql`${t.rating} between 1 and 5`),
    check(
      'reviews_status_check',
      sql`${t.status} in ('pending', 'approved', 'rejected', 'unpublished')`,
    ),
    check('reviews_headline_length_check', sql`char_length(${t.headline}) <= 120`),
    check('reviews_body_length_check', sql`char_length(${t.body}) between 50 and 10000`),
    check('reviews_helpful_count_check', sql`${t.helpfulCount} >= 0`),
  ],
)

/** Every submitted version of a Review, with the decision made on it (PRD §5.3, §9). */
export const reviewVersions = pgTable(
  'review_versions',
  {
    id: uuidv7Pk(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    /** 1 for the first submission, then one more per edit. */
    version: integer('version').notNull(),
    rating: integer('rating').notNull(),
    headline: text('headline'),
    body: text('body').notNull(),
    hasSpoilers: boolean('has_spoilers').notNull().default(false),
    editionId: uuid('edition_id').references(() => editions.id, { onDelete: 'set null' }),
    /** This version's own status: pending until decided, then approved or rejected, or unpublished. */
    status: text('status', { enum: REVIEW_STATUSES }).notNull().default('pending'),
    /** The Moderator who decided; kept as null if their account is erased. */
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decisionReason: text('decision_reason'),
    decidedAt: timestamptz('decided_at'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('review_versions_review_id_version_idx').on(t.reviewId, t.version),
    index('review_versions_decided_by_idx').on(t.decidedBy),
    index('review_versions_edition_id_idx').on(t.editionId),
    check('review_versions_rating_check', sql`${t.rating} between 1 and 5`),
    check(
      'review_versions_status_check',
      sql`${t.status} in ('pending', 'approved', 'rejected', 'unpublished')`,
    ),
    check('review_versions_version_check', sql`${t.version} >= 1`),
  ],
)

/** A Moderator's claim on a queue item; one claim per Review (PRD §7.10, §9). */
export const reviewClaims = pgTable(
  'review_claims',
  {
    reviewId: uuid('review_id')
      .primaryKey()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    moderatorId: uuid('moderator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    claimedAt: timestamptz('claimed_at').notNull().default(sql`now()`),
    expiresAt: timestamptz('expires_at').notNull(),
  },
  (t) => [index('review_claims_moderator_id_idx').on(t.moderatorId)],
)

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert
export type ReviewVersion = typeof reviewVersions.$inferSelect
export type ReviewClaim = typeof reviewClaims.$inferSelect
