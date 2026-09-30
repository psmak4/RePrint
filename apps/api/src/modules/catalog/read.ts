import {
  authors,
  bookGenres,
  bookSeries,
  books,
  contributions,
  covers,
  type Database,
  editions,
  genres,
  series,
} from '@reprint/db'
import {
  type AuthorDetail,
  type AuthorSuggestion,
  type BookDetail,
  type BookSummary,
  CONTRIBUTION_ROLES,
  type Contribution,
  type ContributionRole,
  type Cover,
  type Edition,
  type RatingSummary,
} from '@reprint/shared'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'

type CoverRow = typeof covers.$inferSelect
type EditionRow = typeof editions.$inferSelect
type BookRow = typeof books.$inferSelect

export function toCover(row: CoverRow | null | undefined): Cover | null {
  if (!row) return null
  return {
    origin: row.origin,
    originRef: row.originRef,
    width: row.width,
    height: row.height,
    // Uploads are served from RePrint storage; the web app resolves other origins from `originRef`.
    url: null,
  }
}

async function coversById(db: Database, ids: (string | null)[]): Promise<Map<string, CoverRow>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))]
  if (wanted.length === 0) return new Map()
  const rows = await db.select().from(covers).where(inArray(covers.id, wanted))
  return new Map(rows.map((row) => [row.id, row]))
}

/** The average is rounded to two decimals; the UI shows one (PRD §7.4). */
export function ratingSummary(
  book: Pick<BookRow, 'reviewCount' | 'ratingSum' | 'ratingCounts'>,
): RatingSummary {
  return {
    average:
      book.reviewCount > 0 ? Math.round((book.ratingSum / book.reviewCount) * 100) / 100 : null,
    count: book.reviewCount,
    distribution: book.ratingCounts,
  }
}

function toEdition(row: EditionRow, coverMap: Map<string, CoverRow>): Edition {
  return {
    id: row.id,
    bookId: row.bookId,
    isbn13: row.isbn13,
    format: row.format,
    language: row.language,
    // Editions carry no title of their own until a Source supplies one (PRD §9).
    title: null,
    publisherName: row.publisherName,
    publishedDate: row.publishedDate,
    pageCount: row.pageCount,
    cover: toCover(row.coverId ? coverMap.get(row.coverId) : null),
  }
}

async function bylines(db: Database, bookIds: string[]): Promise<Map<string, Contribution[]>> {
  const result = new Map<string, Contribution[]>()
  if (bookIds.length === 0) return result
  const rows = await db
    .select({
      bookId: contributions.bookId,
      role: contributions.role,
      position: contributions.position,
      authorId: authors.id,
      slug: authors.slug,
      name: authors.name,
    })
    .from(contributions)
    .innerJoin(authors, eq(authors.id, contributions.authorId))
    .where(inArray(contributions.bookId, bookIds))
    .orderBy(asc(contributions.position), asc(authors.name))
  for (const row of rows) {
    const list = result.get(row.bookId) ?? []
    list.push({
      author: { id: row.authorId, slug: row.slug, name: row.name },
      role: row.role,
      position: row.position,
    })
    result.set(row.bookId, list)
  }
  return result
}

/** Cards for the given Books, in the order of `ids`; IDs that no longer exist are dropped. */
export async function loadBookSummaries(db: Database, ids: string[]): Promise<BookSummary[]> {
  if (ids.length === 0) return []
  const rows = await db.select().from(books).where(inArray(books.id, ids))
  const [byline, coverMap] = await Promise.all([
    bylines(
      db,
      rows.map((row) => row.id),
    ),
    coversById(
      db,
      rows.map((row) => row.coverId),
    ),
  ])
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const book = byId.get(id)
    if (!book) return []
    return [
      {
        id: book.id,
        slug: book.slug,
        title: book.title,
        subtitle: book.subtitle,
        cover: toCover(book.coverId ? coverMap.get(book.coverId) : null),
        contributions: byline.get(book.id) ?? [],
        rating: ratingSummary(book),
      },
    ]
  })
}

export async function findBookBySlug(db: Database, slug: string): Promise<BookRow | null> {
  const [row] = await db.select().from(books).where(eq(books.slug, slug)).limit(1)
  return row ?? null
}

export async function loadBookDetail(db: Database, book: BookRow): Promise<BookDetail> {
  const [editionRows, byline, seriesRows, genreRows] = await Promise.all([
    db.select().from(editions).where(eq(editions.bookId, book.id)),
    bylines(db, [book.id]),
    db
      .select({ slug: series.slug, name: series.name, position: bookSeries.position })
      .from(bookSeries)
      .innerJoin(series, eq(series.id, bookSeries.seriesId))
      .where(eq(bookSeries.bookId, book.id))
      .orderBy(asc(series.name)),
    db
      .select({ slug: genres.slug, name: genres.name })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(eq(bookGenres.bookId, book.id))
      .orderBy(asc(genres.name)),
  ])
  const primary = editionRows.find((row) => row.id === book.primaryEditionId) ?? null
  const coverMap = await coversById(db, [book.coverId, primary?.coverId ?? null])
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    firstPublishedYear: book.firstPublishedYear,
    originalLanguage: book.originalLanguage,
    primaryEditionId: book.primaryEditionId,
    // A Book without its own cover shows its Primary Edition's.
    cover: toCover(
      (book.coverId ? coverMap.get(book.coverId) : null) ??
        (primary?.coverId ? coverMap.get(primary.coverId) : null),
    ),
    contributions: byline.get(book.id) ?? [],
    series: seriesRows.map((row) => ({
      series: { slug: row.slug, name: row.name },
      position: row.position,
    })),
    genres: genreRows,
    primaryEdition: primary ? toEdition(primary, coverMap) : null,
    editionCount: editionRows.length,
    rating: ratingSummary(book),
  }
}

/** Newest printings first; Editions without a date go last. */
export async function loadEditions(db: Database, bookId: string): Promise<Edition[]> {
  const rows = await db
    .select()
    .from(editions)
    .where(eq(editions.bookId, bookId))
    .orderBy(sql`${editions.publishedDate} desc nulls last`, asc(editions.id))
  const coverMap = await coversById(
    db,
    rows.map((row) => row.coverId),
  )
  return rows.map((row) => toEdition(row, coverMap))
}

/** Name-only rows for the given Authors, in the order of `ids`. */
export async function loadAuthorSuggestions(
  db: Database,
  ids: string[],
): Promise<AuthorSuggestion[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: authors.id, slug: authors.slug, name: authors.name })
    .from(authors)
    .where(inArray(authors.id, ids))
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

export async function findAuthorBySlug(db: Database, slug: string) {
  const [row] = await db.select().from(authors).where(eq(authors.slug, slug)).limit(1)
  return row ?? null
}

/** An Author's Books grouped by Role (in `CONTRIBUTION_ROLES` order), most reviewed first (PRD §7.5). */
export async function loadAuthorDetail(
  db: Database,
  author: typeof authors.$inferSelect,
): Promise<AuthorDetail> {
  const rows = await db
    .select({ role: contributions.role, book: books })
    .from(contributions)
    .innerJoin(books, eq(books.id, contributions.bookId))
    .where(eq(contributions.authorId, author.id))
    .orderBy(desc(books.reviewCount), asc(books.title), asc(books.id))
  const [byline, coverMap, photoMap] = await Promise.all([
    bylines(db, [...new Set(rows.map((row) => row.book.id))]),
    coversById(
      db,
      rows.map((row) => row.book.coverId),
    ),
    coversById(db, [author.photoId]),
  ])
  const grouped = new Map<ContributionRole, BookSummary[]>()
  for (const { role, book } of rows) {
    const list = grouped.get(role) ?? []
    list.push({
      id: book.id,
      slug: book.slug,
      title: book.title,
      subtitle: book.subtitle,
      cover: toCover(book.coverId ? coverMap.get(book.coverId) : null),
      contributions: byline.get(book.id) ?? [],
      rating: ratingSummary(book),
    })
    grouped.set(role, list)
  }
  return {
    id: author.id,
    slug: author.slug,
    name: author.name,
    alternateNames: author.alternateNames,
    bio: author.bio,
    birthDate: author.birthDate,
    deathDate: author.deathDate,
    photo: toCover(author.photoId ? photoMap.get(author.photoId) : null),
    works: CONTRIBUTION_ROLES.flatMap((role) => {
      const list = grouped.get(role)
      return list ? [{ role, books: list }] : []
    }),
  }
}
