import {
  authors,
  bookSeries,
  bookSubjects,
  books,
  contributions,
  covers,
  type Database,
  editions,
  mergeCandidates,
  newId,
  series,
  sourceLinks,
  sourceRecords,
  subjects,
} from '@reprint/db'
import {
  type AuthorRecord,
  type BookCandidate,
  bookCandidateSchema,
  type Cover,
  type FieldOrigins,
  fieldOriginsSchema,
  makeSlug,
} from '@reprint/shared'
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { SourceAdapter } from '../sources/types.js'
import { type IncomingField, isLocked, planFieldUpdate } from './fields.js'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/** The candidate cannot be stored: the Source is not a Store Source, or the candidate is not its own. */
export class IngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestError'
  }
}

export interface IngestInput {
  /** The Source the candidate came from. Only `store` Sources are accepted (PRD §6). */
  source: Pick<SourceAdapter, 'name' | 'storagePolicy'>
  candidate: BookCandidate
  /** Full Author records the caller fetched, keyed by the Author's Source ID. */
  authorRecords?: ReadonlyMap<string, AuthorRecord>
  /** The response to keep in `source_records` for 30 days; defaults to the candidate itself. */
  rawRecord?: unknown
  now?: Date
}

export interface IngestResult {
  bookId: string
  slug: string
  /** True when a new Book was created; false when the candidate matched an existing one. */
  created: boolean
  /** Existing Books queued for an admin to check as possible duplicates (PRD §5.4). */
  mergeCandidateBookIds: string[]
  /** Editions left out because their ISBN-13 already belongs to a different Book. */
  skippedEditions: number
}

function fieldOriginsOf(value: unknown): FieldOrigins {
  const parsed = fieldOriginsSchema.safeParse(value)
  return parsed.success ? parsed.data : {}
}

/** Finds or creates the `covers` row for a Source image. Uploads never come from a Source. */
async function resolveCover(tx: Tx, cover: Cover | null): Promise<string | null> {
  if (!cover || cover.origin === 'upload') return null
  if (cover.originRef) {
    const [existing] = await tx
      .select({ id: covers.id })
      .from(covers)
      .where(and(eq(covers.origin, cover.origin), eq(covers.originRef, cover.originRef)))
      .limit(1)
    if (existing) return existing.id
  }
  const [row] = await tx
    .insert(covers)
    .values({
      origin: cover.origin,
      originRef: cover.originRef,
      width: cover.width,
      height: cover.height,
    })
    .returning({ id: covers.id })
  return row?.id ?? null
}

async function linkedEntityId(
  tx: Tx,
  entityType: 'book' | 'edition' | 'author',
  source: string,
  sourceId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ entityId: sourceLinks.entityId })
    .from(sourceLinks)
    .where(
      and(
        eq(sourceLinks.source, source),
        eq(sourceLinks.entityType, entityType),
        eq(sourceLinks.sourceId, sourceId),
      ),
    )
    .limit(1)
  return row?.entityId ?? null
}

async function addLink(
  tx: Tx,
  entityType: 'book' | 'edition' | 'author',
  entityId: string,
  source: string,
  sourceId: string,
) {
  await tx
    .insert(sourceLinks)
    .values({ entityType, entityId, source, sourceId })
    .onConflictDoNothing()
}

/** PRD §5.4 matching order: an existing Source link, then an ISBN-13 on any of the Editions. */
async function findExistingBook(tx: Tx, candidate: BookCandidate): Promise<string | null> {
  const { source, sourceId } = candidate.sourceLink
  const linked = await linkedEntityId(tx, 'book', source, sourceId)
  if (linked) return linked
  const isbns = candidate.editions.flatMap((edition) => (edition.isbn13 ? [edition.isbn13] : []))
  if (isbns.length === 0) return null
  const [row] = await tx
    .select({ bookId: editions.bookId })
    .from(editions)
    .where(inArray(editions.isbn13, isbns))
    .orderBy(editions.bookId)
    .limit(1)
  return row?.bookId ?? null
}

async function upsertBook(
  tx: Tx,
  input: { source: string; candidate: BookCandidate; now: Date; existingId: string | null },
): Promise<{ id: string; slug: string; created: boolean; lockedFields: string[] }> {
  const { source, candidate, now, existingId } = input
  const coverId = await resolveCover(tx, candidate.book.cover)
  const incoming: IncomingField[] = [
    { field: 'title', column: 'title', value: candidate.book.title },
    { field: 'subtitle', column: 'subtitle', value: candidate.book.subtitle },
    { field: 'description', column: 'description', value: candidate.book.description },
    {
      field: 'firstPublishedYear',
      column: 'firstPublishedYear',
      value: candidate.book.firstPublishedYear,
    },
    {
      field: 'originalLanguage',
      column: 'originalLanguage',
      value: candidate.book.originalLanguage,
    },
    { field: 'cover', column: 'coverId', value: coverId },
  ]
  if (existingId) {
    const [current] = await tx.select().from(books).where(eq(books.id, existingId)).limit(1)
    if (!current) throw new IngestError('The linked Book no longer exists')
    const plan = planFieldUpdate({
      source,
      now,
      current,
      origins: fieldOriginsOf(current.fieldOrigins),
      lockedFields: current.lockedFields,
      incoming,
    })
    await tx
      .update(books)
      .set({
        ...(plan.set as Partial<typeof books.$inferInsert>),
        fieldOrigins: plan.origins,
        refreshedAt: now,
      })
      .where(eq(books.id, existingId))
    return {
      id: current.id,
      slug: current.slug,
      created: false,
      lockedFields: current.lockedFields,
    }
  }
  const id = newId()
  const plan = planFieldUpdate({ source, now, current: {}, origins: {}, incoming })
  const slug = makeSlug(candidate.book.title, id)
  await tx.insert(books).values({
    ...(plan.set as Partial<typeof books.$inferInsert>),
    id,
    slug,
    title: candidate.book.title,
    fieldOrigins: plan.origins,
    refreshedAt: now,
  })
  return { id, slug, created: true, lockedFields: [] }
}

async function isbnTaken(tx: Tx, isbn13: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: editions.id })
    .from(editions)
    .where(eq(editions.isbn13, isbn13))
    .limit(1)
  return row !== undefined
}

async function upsertEditions(
  tx: Tx,
  input: { source: string; candidate: BookCandidate; bookId: string; now: Date },
): Promise<number> {
  const { source, candidate, bookId, now } = input
  let skipped = 0
  for (const edition of candidate.editions) {
    const coverId = await resolveCover(tx, edition.cover)
    const sourceId = edition.sourceLink?.sourceId
    let existing: typeof editions.$inferSelect | undefined
    if (sourceId) {
      const linked = await linkedEntityId(tx, 'edition', source, sourceId)
      if (linked) {
        ;[existing] = await tx.select().from(editions).where(eq(editions.id, linked)).limit(1)
      }
    }
    if (!existing && edition.isbn13) {
      ;[existing] = await tx
        .select()
        .from(editions)
        .where(eq(editions.isbn13, edition.isbn13))
        .limit(1)
    }
    if (!existing && !edition.isbn13 && !sourceId) {
      // Nothing identifies it, so match a stored Edition of this Book that says the same thing.
      ;[existing] = await tx
        .select()
        .from(editions)
        .where(
          and(
            eq(editions.bookId, bookId),
            isNull(editions.isbn13),
            eq(editions.format, edition.format),
            edition.language ? eq(editions.language, edition.language) : isNull(editions.language),
            edition.publisherName
              ? eq(editions.publisherName, edition.publisherName)
              : isNull(editions.publisherName),
            edition.publishedDate
              ? eq(editions.publishedDate, edition.publishedDate)
              : isNull(editions.publishedDate),
            edition.pageCount
              ? eq(editions.pageCount, edition.pageCount)
              : isNull(editions.pageCount),
          ),
        )
        .limit(1)
    }
    if (existing && existing.bookId !== bookId) {
      skipped += 1 // the ISBN-13 or Source link belongs to another Book; never move an Edition
      continue
    }
    // An ISBN-13 is set once: a stored one is never replaced, and one held by another Edition is not taken.
    let isbn13: string | null = edition.isbn13
    if (isbn13 && existing && (existing.isbn13 || (await isbnTaken(tx, isbn13)))) isbn13 = null
    const incoming: IncomingField[] = [
      { field: 'isbn13', column: 'isbn13', value: isbn13 },
      { field: 'format', column: 'format', value: edition.format },
      { field: 'language', column: 'language', value: edition.language },
      { field: 'publisherName', column: 'publisherName', value: edition.publisherName },
      { field: 'publishedDate', column: 'publishedDate', value: edition.publishedDate },
      { field: 'pageCount', column: 'pageCount', value: edition.pageCount },
      { field: 'cover', column: 'coverId', value: coverId },
    ]
    let editionId: string
    if (existing) {
      editionId = existing.id
      const plan = planFieldUpdate({
        source,
        now,
        current: existing,
        origins: fieldOriginsOf(existing.fieldOrigins),
        incoming,
      })
      await tx
        .update(editions)
        .set({
          ...(plan.set as Partial<typeof editions.$inferInsert>),
          fieldOrigins: plan.origins,
        })
        .where(eq(editions.id, existing.id))
    } else {
      editionId = newId()
      const plan = planFieldUpdate({ source, now, current: {}, origins: {}, incoming })
      await tx.insert(editions).values({
        ...(plan.set as Partial<typeof editions.$inferInsert>),
        id: editionId,
        bookId,
        fieldOrigins: plan.origins,
      })
    }
    if (sourceId) await addLink(tx, 'edition', editionId, source, sourceId)
  }
  return skipped
}

/** Finds the Author for one byline entry, or creates them. Returns their ID. */
async function upsertAuthor(
  tx: Tx,
  input: {
    source: string
    name: string
    link: { sourceId: string } | undefined
    record: AuthorRecord | undefined
    bookId: string
    now: Date
  },
): Promise<string> {
  const { source, name, link, record, bookId, now } = input
  let existing: typeof authors.$inferSelect | undefined
  if (link) {
    const linked = await linkedEntityId(tx, 'author', source, link.sourceId)
    if (linked) [existing] = await tx.select().from(authors).where(eq(authors.id, linked)).limit(1)
  }
  if (!existing) {
    // Never merge people by name across the Catalog; reuse only an Author already credited on this Book.
    ;[existing] = await tx
      .select({ author: authors })
      .from(contributions)
      .innerJoin(authors, eq(authors.id, contributions.authorId))
      .where(and(eq(contributions.bookId, bookId), sql`lower(${authors.name}) = lower(${name})`))
      .limit(1)
      .then((rows) => rows.map((row) => row.author))
  }
  const photoId = await resolveCover(tx, record?.photo ?? null)
  const incoming: IncomingField[] = [
    { field: 'name', column: 'name', value: record?.name ?? name },
    { field: 'alternateNames', column: 'alternateNames', value: record?.alternateNames },
    { field: 'bio', column: 'bio', value: record?.bio },
    { field: 'birthDate', column: 'birthDate', value: record?.birthDate },
    { field: 'deathDate', column: 'deathDate', value: record?.deathDate },
    { field: 'authorPhoto', column: 'photoId', value: photoId },
  ]
  let authorId: string
  if (existing) {
    authorId = existing.id
    const plan = planFieldUpdate({
      source,
      now,
      current: existing,
      origins: fieldOriginsOf(existing.fieldOrigins),
      incoming,
    })
    await tx
      .update(authors)
      .set({ ...(plan.set as Partial<typeof authors.$inferInsert>), fieldOrigins: plan.origins })
      .where(eq(authors.id, existing.id))
  } else {
    authorId = newId()
    const plan = planFieldUpdate({ source, now, current: {}, origins: {}, incoming })
    await tx.insert(authors).values({
      ...(plan.set as Partial<typeof authors.$inferInsert>),
      id: authorId,
      slug: makeSlug(record?.name ?? name, authorId),
      name: record?.name ?? name,
      fieldOrigins: plan.origins,
    })
  }
  if (link) await addLink(tx, 'author', authorId, source, link.sourceId)
  return authorId
}

async function upsertContributions(
  tx: Tx,
  input: {
    source: string
    candidate: BookCandidate
    bookId: string
    authorRecords: ReadonlyMap<string, AuthorRecord>
    now: Date
  },
): Promise<string[]> {
  const { source, candidate, bookId, authorRecords, now } = input
  const names: string[] = []
  for (const contribution of candidate.book.contributions) {
    const link = contribution.sourceLink
    const authorId = await upsertAuthor(tx, {
      source,
      name: contribution.authorName,
      link,
      record: link ? authorRecords.get(link.sourceId) : undefined,
      bookId,
      now,
    })
    names.push(contribution.authorName)
    await tx
      .insert(contributions)
      .values({ bookId, authorId, role: contribution.role, position: contribution.position })
      .onConflictDoUpdate({
        target: [contributions.bookId, contributions.authorId, contributions.role],
        set: { position: contribution.position },
      })
  }
  return names
}

async function upsertSeries(
  tx: Tx,
  candidate: BookCandidate,
  bookId: string,
  source: string,
  now: Date,
) {
  for (const membership of candidate.book.series) {
    let [row] = await tx
      .select({ id: series.id })
      .from(series)
      .where(sql`lower(${series.name}) = lower(${membership.name})`)
      .limit(1)
    if (!row) {
      const id = newId()
      await tx.insert(series).values({
        id,
        slug: makeSlug(membership.name, id),
        name: membership.name,
        fieldOrigins: { name: { source, at: now.toISOString() } },
      })
      row = { id }
    }
    await tx
      .insert(bookSeries)
      .values({ bookId, seriesId: row.id, position: membership.position })
      .onConflictDoUpdate({
        target: [bookSeries.bookId, bookSeries.seriesId],
        // A Source that no longer knows the position must not erase one we have.
        set: { position: sql`coalesce(excluded.position, ${bookSeries.position})` },
      })
  }
}

async function upsertSubjects(tx: Tx, candidate: BookCandidate, bookId: string) {
  const labels = [...new Set(candidate.book.subjects.map((subject) => subject.label))]
  if (labels.length === 0) return
  await tx
    .insert(subjects)
    .values(labels.map((label) => ({ label })))
    .onConflictDoNothing()
  const rows = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(inArray(subjects.label, labels))
  if (rows.length === 0) return
  await tx
    .insert(bookSubjects)
    .values(rows.map((row) => ({ bookId, subjectId: row.id })))
    .onConflictDoNothing()
}

/**
 * A new Book that shares its title and an Author with a stored Book is queued for an admin to check;
 * it is never merged automatically (PRD §5.4).
 */
async function queueMergeCandidates(
  tx: Tx,
  input: { bookId: string; title: string; authorNames: string[] },
): Promise<string[]> {
  const lowerNames = input.authorNames.map((name) => name.toLowerCase())
  if (lowerNames.length === 0) return []
  const rows = await tx
    .selectDistinct({ id: books.id })
    .from(books)
    .innerJoin(contributions, eq(contributions.bookId, books.id))
    .innerJoin(authors, eq(authors.id, contributions.authorId))
    .where(
      and(
        ne(books.id, input.bookId),
        sql`lower(unaccent(${books.title})) = lower(unaccent(${input.title}))`,
        inArray(sql`lower(${authors.name})`, lowerNames),
      ),
    )
  if (rows.length === 0) return []
  await tx
    .insert(mergeCandidates)
    .values(
      rows.map((row) => ({
        bookAId: row.id,
        bookBId: input.bookId,
        reason: 'same_title_and_author',
      })),
    )
    .onConflictDoNothing()
  return rows.map((row) => row.id)
}

/** Rebuilds the Book's search vector from its title, Authors, Series, and ISBNs (M3 brief). */
export async function refreshSearchVector(tx: Tx, bookId: string) {
  await tx.execute(sql`
    update books set search_vector =
      setweight(to_tsvector('simple', unaccent(coalesce(title, '') || ' ' || coalesce(subtitle, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce((
        select string_agg(a.name || ' ' || array_to_string(a.alternate_names, ' '), ' ')
        from contributions c join authors a on a.id = c.author_id
        where c.book_id = books.id), ''))), 'B') ||
      setweight(to_tsvector('simple', unaccent(coalesce((
        select string_agg(s.name, ' ')
        from book_series bs join series s on s.id = bs.series_id
        where bs.book_id = books.id), ''))), 'B') ||
      setweight(to_tsvector('simple', coalesce((
        select string_agg(e.isbn_13, ' ') from editions e where e.book_id = books.id), '')), 'C')
    where id = ${bookId}`)
}

/**
 * Stores one Book candidate in the Catalog in a single transaction (PRD §5.4, §6): matches an existing
 * Book by Source link, then ISBN-13; otherwise creates a Book and queues title-and-author look-alikes
 * for an admin. Locked fields are never overwritten, each written field records its Source and time,
 * and the raw record is kept in `source_records`. Safe to repeat: the same record creates no duplicates.
 */
export async function ingestBook(db: Database, input: IngestInput): Promise<IngestResult> {
  const { source } = input
  if (source.storagePolicy !== 'store') {
    throw new IngestError(`Source "${source.name}" does not allow its data to be stored`)
  }
  const candidate = bookCandidateSchema.parse(input.candidate)
  if (candidate.sourceLink.source !== source.name) {
    throw new IngestError(
      `Candidate belongs to "${candidate.sourceLink.source}", not "${source.name}"`,
    )
  }
  const now = input.now ?? new Date()
  const authorRecords = input.authorRecords ?? new Map<string, AuthorRecord>()

  return db.transaction(async (tx) => {
    // Two people opening the same new Book at once must not both create it.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`catalog.ingest:${source.name}:${candidate.sourceLink.sourceId}`}, 0))`,
    )
    const existingId = await findExistingBook(tx, candidate)
    const book = await upsertBook(tx, { source: source.name, candidate, now, existingId })
    await addLink(tx, 'book', book.id, source.name, candidate.sourceLink.sourceId)
    const skippedEditions = await upsertEditions(tx, {
      source: source.name,
      candidate,
      bookId: book.id,
      now,
    })
    let authorNames: string[] = []
    if (!isLocked('contributions', book.lockedFields, {})) {
      authorNames = await upsertContributions(tx, {
        source: source.name,
        candidate,
        bookId: book.id,
        authorRecords,
        now,
      })
    }
    if (!isLocked('series', book.lockedFields, {})) {
      await upsertSeries(tx, candidate, book.id, source.name, now)
    }
    if (!isLocked('subjects', book.lockedFields, {})) await upsertSubjects(tx, candidate, book.id)
    const mergeCandidateBookIds = book.created
      ? await queueMergeCandidates(tx, {
          bookId: book.id,
          title: candidate.book.title,
          authorNames,
        })
      : []
    await refreshSearchVector(tx, book.id)
    await tx.insert(sourceRecords).values({
      source: source.name,
      sourceId: candidate.sourceLink.sourceId,
      payload: input.rawRecord ?? candidate,
      fetchedAt: now,
    })
    return {
      bookId: book.id,
      slug: book.slug,
      created: book.created,
      mergeCandidateBookIds,
      skippedEditions,
    }
  })
}
