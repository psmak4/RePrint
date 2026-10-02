import { REPORT_STATUSES, REVIEW_REPORT_REASONS, REVIEW_STATUSES } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
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
    /** Kept in step with `helpful_votes` in the same transaction as each vote change. */
    helpfulCount: integer('helpful_count').notNull().default(0),
    /** When the current content was submitted (new or edited). */
    submittedAt: timestamptz('submitted_at').notNull().default(sql`now()`),
    /** When a Moderator last decided this Review; null while Pending. */
    decidedAt: timestamptz('decided_at'),
    /** Set when the Review gets its 3rd open report; hidden from public lists until decided (D-040). */
    hiddenAt: timestamptz('hidden_at'),
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

/**
 * A Member marking someone else's Approved Review helpful (PRD §5.3, §9). Both FKs cascade, so a
 * deleted Review or an erased account takes its votes along; `reviews.helpful_count` is kept in
 * step by the code that inserts or deletes rows here.
 */
export const helpfulVotes = pgTable(
  'helpful_votes',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.userId] }),
    index('helpful_votes_user_id_idx').on(t.userId),
  ],
)

/**
 * A Member's report on an Approved Review (PRD §5.3, §7.9, §9). One per reporter per Review.
 * Both FKs cascade: an erased reporter's reports go with their account, and a deleted Review
 * takes its reports along. `resolved_by` is kept as null if the Moderator is erased.
 */
export const reviewReports = pgTable(
  'review_reports',
  {
    id: uuidv7Pk(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: REVIEW_REPORT_REASONS }).notNull(),
    note: text('note'),
    status: text('status', { enum: REPORT_STATUSES }).notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    resolvedAt: timestamptz('resolved_at'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    unique('review_reports_review_id_reporter_id_unique').on(t.reviewId, t.reporterId),
    index('review_reports_reporter_id_idx').on(t.reporterId),
    index('review_reports_resolved_by_idx').on(t.resolvedBy),
    // The reports queue: open reports, oldest first.
    index('review_reports_open_queue_idx').on(t.createdAt).where(sql`${t.status} = 'open'`),
    check(
      'review_reports_reason_check',
      sql`${t.reason} in ('unmarked_spoiler', 'offensive', 'spam', 'off_topic', 'other')`,
    ),
    check('review_reports_status_check', sql`${t.status} in ('open', 'dismissed', 'actioned')`),
    check('review_reports_note_length_check', sql`char_length(${t.note}) <= 500`),
  ],
)

export type Review = typeof reviews.$inferSelect
export type NewReview = typeof reviews.$inferInsert
export type ReviewVersion = typeof reviewVersions.$inferSelect
export type ReviewClaim = typeof reviewClaims.$inferSelect
export type ReviewReport = typeof reviewReports.$inferSelect
