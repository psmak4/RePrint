import { CONTRIBUTION_ROLES, FORMATS } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { covers } from './covers.js'
import { timestamps, timestamptz, tsvector, uuidv7Pk } from './helpers.js'

/** Catalog entity types that a Source link can point at. */
const SOURCE_LINK_ENTITY_TYPES = ['book', 'edition', 'author', 'series'] as const

/** A Book (PRD §5.1, §9). Cached aggregates are kept in step with review status by M4. */
export const books = pgTable(
  'books',
  {
    id: uuidv7Pk(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    firstPublishedYear: integer('first_published_year'),
    originalLanguage: text('original_language'),
    primaryEditionId: uuid('primary_edition_id').references((): AnyPgColumn => editions.id, {
      onDelete: 'set null',
    }),
    coverId: uuid('cover_id').references(() => covers.id, { onDelete: 'set null' }),
    /** Per field: which Source set it (or `admin`) and when. */
    fieldOrigins: jsonb('field_origins').notNull().default(sql`'{}'::jsonb`),
    /** Fields an admin set; a refresh never overwrites them. */
    lockedFields: text('locked_fields').array().notNull().default(sql`'{}'::text[]`),
    searchVector: tsvector('search_vector'),
    reviewCount: integer('review_count').notNull().default(0),
    ratingSum: integer('rating_sum').notNull().default(0),
    /** Count of Approved Reviews at 1 to 5 stars, index 0 being one star. */
    ratingCounts: integer('rating_counts').array().notNull().default(sql`'{0,0,0,0,0}'::integer[]`),
    /** When a Source last refreshed this Book; drives the 30-day stale refresh (PRD §6). */
    refreshedAt: timestamptz('refreshed_at'),
    ...timestamps(),
  },
  (t) => [
    index('books_search_vector_idx').using('gin', t.searchVector),
    index('books_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    index('books_primary_edition_id_idx').on(t.primaryEditionId),
    index('books_cover_id_idx').on(t.coverId),
    check('books_rating_counts_check', sql`array_length(${t.ratingCounts}, 1) = 5`),
    check('books_review_count_check', sql`${t.reviewCount} >= 0 and ${t.ratingSum} >= 0`),
  ],
)

/** One published version of a Book (PRD §5.1, §9). */
export const editions = pgTable(
  'editions',
  {
    id: uuidv7Pk(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    isbn13: text('isbn_13').unique(),
    format: text('format', { enum: FORMATS }).notNull().default('unknown'),
    language: text('language'),
    publisherName: text('publisher_name'),
    /** Adapters normalize partial dates to a full `YYYY-MM-DD` (D-093). */
    publishedDate: date('published_date', { mode: 'string' }),
    pageCount: integer('page_count'),
    coverId: uuid('cover_id').references(() => covers.id, { onDelete: 'set null' }),
    fieldOrigins: jsonb('field_origins').notNull().default(sql`'{}'::jsonb`),
    ...timestamps(),
  },
  (t) => [
    index('editions_book_id_idx').on(t.bookId),
    index('editions_cover_id_idx').on(t.coverId),
    check('editions_isbn_13_check', sql`${t.isbn13} ~ '^[0-9]{13}$'`),
    check(
      'editions_format_check',
      sql`${t.format} in ('hardcover', 'paperback', 'ebook', 'audiobook', 'unknown')`,
    ),
    check('editions_page_count_check', sql`${t.pageCount} > 0`),
  ],
)

/** A person credited on Books (PRD §5.1, §9). */
export const authors = pgTable(
  'authors',
  {
    id: uuidv7Pk(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    alternateNames: text('alternate_names').array().notNull().default(sql`'{}'::text[]`),
    bio: text('bio'),
    birthDate: date('birth_date', { mode: 'string' }),
    deathDate: date('death_date', { mode: 'string' }),
    photoId: uuid('photo_id').references(() => covers.id, { onDelete: 'set null' }),
    fieldOrigins: jsonb('field_origins').notNull().default(sql`'{}'::jsonb`),
    ...timestamps(),
  },
  (t) => [
    index('authors_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('authors_photo_id_idx').on(t.photoId),
  ],
)

/** Links an Author to a Book with a Role (PRD §5.1, §9). */
export const contributions = pgTable(
  'contributions',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'cascade' }),
    role: text('role', { enum: CONTRIBUTION_ROLES }).notNull(),
    /** The order of names in the byline. */
    position: integer('position'),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.authorId, t.role] }),
    index('contributions_author_id_idx').on(t.authorId),
    check(
      'contributions_role_check',
      sql`${t.role} in ('author', 'co_author', 'translator', 'illustrator', 'editor', 'narrator', 'other')`,
    ),
  ],
)

/**
 * Connects a Catalog record to its ID at a Source. `entity_id` points at one of several tables, so it has
 * no foreign key; the Source ID lives only here (PRD §5.4).
 */
export const sourceLinks = pgTable(
  'source_links',
  {
    id: uuidv7Pk(),
    entityType: text('entity_type', { enum: SOURCE_LINK_ENTITY_TYPES }).notNull(),
    entityId: uuid('entity_id').notNull(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    uniqueIndex('source_links_source_entity_type_source_id_idx').on(
      t.source,
      t.entityType,
      t.sourceId,
    ),
    index('source_links_entity_idx').on(t.entityType, t.entityId),
    check(
      'source_links_entity_type_check',
      sql`${t.entityType} in ('book', 'edition', 'author', 'series')`,
    ),
  ],
)

/** The raw Source response, kept 30 days for debugging (PRD §5.2). */
export const sourceRecords = pgTable(
  'source_records',
  {
    id: uuidv7Pk(),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    payload: jsonb('payload').notNull(),
    fetchedAt: timestamptz('fetched_at').notNull().default(sql`now()`),
  },
  (t) => [
    index('source_records_source_source_id_idx').on(t.source, t.sourceId),
    index('source_records_fetched_at_idx').on(t.fetchedAt),
  ],
)
