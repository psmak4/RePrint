import { CONTRIBUTION_ROLES, FORMATS, GENRE_ORIGINS } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { covers } from './covers.js'
import { citext, timestamps, timestamptz, tsvector, uuidv7Pk } from './helpers.js'

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
    /**
     * How many Editions the Source knows of, when it says (D-190). The Catalog stores only a page of
     * them, so this can be larger than the stored count. Source metadata: never edited by an admin.
     */
    sourceEditionCount: integer('source_edition_count'),
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

/** A named, ordered set of Books (PRD §5.1, §9). */
export const series = pgTable('series', {
  id: uuidv7Pk(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  fieldOrigins: jsonb('field_origins').notNull().default(sql`'{}'::jsonb`),
  ...timestamps(),
})

/** A Book's place in a Series. `position` may be decimal (2.5) or empty (PRD §5.1). */
export const bookSeries = pgTable(
  'book_series',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    position: numeric('position', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.seriesId] }),
    index('book_series_series_id_idx').on(t.seriesId),
    check('book_series_position_check', sql`${t.position} >= 0`),
  ],
)

/** A curated browse category (PRD §5.1). The list is reference data, loaded by a data migration. */
export const genres = pgTable(
  'genres',
  {
    id: uuidv7Pk(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    parentId: uuid('parent_id').references((): AnyPgColumn => genres.id, { onDelete: 'set null' }),
    featured: boolean('featured').notNull().default(false),
    /** An archived Genre is hidden from browsing and mapping; Books keep it (D-158). */
    archivedAt: timestamptz('archived_at'),
    ...timestamps(),
  },
  (t) => [index('genres_parent_id_idx').on(t.parentId)],
)

/** A Book's Genres. `origin` says whether a mapping rule or an admin set it; admin rows are locked. */
export const bookGenres = pgTable(
  'book_genres',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    origin: text('origin', { enum: GENRE_ORIGINS }).notNull().default('mapping'),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.genreId] }),
    index('book_genres_genre_id_idx').on(t.genreId),
    check('book_genres_origin_check', sql`${t.origin} in ('mapping', 'admin')`),
  ],
)

/** A raw Source tag. It feeds search and Genre mapping and is never shown as a category (PRD §5.1). */
export const subjects = pgTable('subjects', {
  id: uuidv7Pk(),
  label: citext('label').notNull().unique(),
  createdAt: timestamptz('created_at').notNull().default(sql`now()`),
})

export const bookSubjects = pgTable(
  'book_subjects',
  {
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.bookId, t.subjectId] }),
    index('book_subjects_subject_id_idx').on(t.subjectId),
  ],
)

/** Maps Subjects to Genres: a case-insensitive substring `pattern`, higher `priority` first (D-015). */
export const subjectGenreRules = pgTable(
  'subject_genre_rules',
  {
    id: uuidv7Pk(),
    pattern: text('pattern').notNull(),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(50),
    ...timestamps(),
  },
  (t) => [
    index('subject_genre_rules_genre_id_idx').on(t.genreId),
    unique('subject_genre_rules_pattern_genre_id_unique').on(t.pattern, t.genreId),
    check('subject_genre_rules_pattern_check', sql`length(trim(${t.pattern})) > 0`),
  ],
)

export const MERGE_CANDIDATE_STATUSES = ['pending', 'merged', 'dismissed'] as const

/** Two Books that may be duplicates, for an admin to check (PRD §5.4). Never merged automatically. */
export const mergeCandidates = pgTable(
  'merge_candidates',
  {
    id: uuidv7Pk(),
    bookAId: uuid('book_a_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    bookBId: uuid('book_b_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status', { enum: MERGE_CANDIDATE_STATUSES }).notNull().default('pending'),
    ...timestamps(),
  },
  (t) => [
    index('merge_candidates_book_a_id_idx').on(t.bookAId),
    index('merge_candidates_book_b_id_idx').on(t.bookBId),
    index('merge_candidates_status_idx').on(t.status),
    unique('merge_candidates_pair_unique').on(t.bookAId, t.bookBId),
    check('merge_candidates_distinct_check', sql`${t.bookAId} <> ${t.bookBId}`),
    check('merge_candidates_status_check', sql`${t.status} in ('pending', 'merged', 'dismissed')`),
  ],
)

/**
 * The old slug of a Book that was merged into another (PRD §7.11, D-157). Looking up the old slug
 * finds the remaining Book, so links and bookmarks keep working. The slug is the key; it was unique
 * among Books, and a Book's slug never changes, so it cannot be reused.
 */
export const bookSlugRedirects = pgTable(
  'book_slug_redirects',
  {
    slug: text('slug').primaryKey(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [index('book_slug_redirects_book_id_idx').on(t.bookId)],
)
