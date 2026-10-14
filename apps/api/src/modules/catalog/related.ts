import {
  authors,
  bookGenres,
  bookSeries,
  books,
  contributions,
  type Database,
  genres,
  series,
} from '@reprint/db'
import {
  type BookRelatedResponse,
  CONTRIBUTION_ROLES,
  groupContributors,
  RELATED_BOOKS_LIMIT,
} from '@reprint/shared'
import { and, asc, countDistinct, eq, sql } from 'drizzle-orm'
import { genreBookIds } from './genres.js'
import { type BookDetailRow, bylines, coversById, loadBookSummaries, toCover } from './read.js'
import { loadSeriesEntries } from './series.js'

/** The Author page's Role order (`CONTRIBUTION_ROLES`), as a SQL array for `array_position`. */
const ROLE_ORDER = sql`array[${sql.join(
  CONTRIBUTION_ROLES.map((role) => sql`${role}`),
  sql`, `,
)}]::text[]`

/**
 * Up to 6 other Books by the Author, as the Book page took them from the Author page: Roles in
 * `CONTRIBUTION_ROLES` order, then most reviewed, most Source Editions, title, and ID (D-203),
 * each Book once, in its first Role.
 */
async function otherBooksBy(db: Database, authorId: string, bookId: string): Promise<string[]> {
  const rows = await db
    .select({ id: books.id })
    .from(contributions)
    .innerJoin(books, eq(books.id, contributions.bookId))
    .where(and(eq(contributions.authorId, authorId), sql`${books.id} <> ${bookId}`))
    .groupBy(books.id)
    .orderBy(
      sql`min(array_position(${ROLE_ORDER}, ${contributions.role}::text))`,
      sql`${books.reviewCount} desc`,
      sql`${books.sourceEditionCount} desc nulls last`,
      asc(books.title),
      asc(books.id),
    )
    .limit(RELATED_BOOKS_LIMIT)
  return rows.map((row) => row.id)
}

async function authorPart(
  db: Database,
  slug: string,
  bookId: string,
): Promise<BookRelatedResponse['author']> {
  const [author] = await db.select().from(authors).where(eq(authors.slug, slug)).limit(1)
  if (!author) return null
  const [ids, [credited], photos] = await Promise.all([
    otherBooksBy(db, author.id, bookId),
    db
      .select({ n: countDistinct(contributions.bookId) })
      .from(contributions)
      .where(eq(contributions.authorId, author.id)),
    coversById(db, [author.photoId]),
  ])
  return {
    slug: author.slug,
    name: author.name,
    bio: author.bio,
    birthDate: author.birthDate,
    deathDate: author.deathDate,
    photo: toCover(author.photoId ? photos.get(author.photoId) : null),
    bookCount: credited?.n ?? 0,
    books: await loadBookSummaries(db, ids),
  }
}

/**
 * What the Book page shows around a Book (M10-T06): its first credited Author's card and other
 * Books, its first Series around it, and its first Genre's other top-rated Books. The same Books in
 * the same order the page used to take from the Author, Series, and Genre endpoints, without
 * loading those pages whole, and without the Author page's bibliography import (D-205).
 */
export async function loadBookRelated(
  db: Database,
  book: BookDetailRow,
  siteMean: () => Promise<number>,
): Promise<BookRelatedResponse> {
  const [byline, [firstSeries], [firstGenre]] = await Promise.all([
    bylines(db, [book.id]),
    db
      .select({ series })
      .from(bookSeries)
      .innerJoin(series, eq(series.id, bookSeries.seriesId))
      .where(eq(bookSeries.bookId, book.id))
      .orderBy(asc(series.name))
      .limit(1),
    // The page names a Book's Genres by name, archived ones too, but an archived Genre has no page.
    db
      .select({
        id: genres.id,
        slug: genres.slug,
        name: genres.name,
        archivedAt: genres.archivedAt,
      })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(eq(bookGenres.bookId, book.id))
      .orderBy(asc(genres.name))
      .limit(1),
  ])
  const firstAuthor = groupContributors(byline.get(book.id) ?? [])[0]?.people[0]
  const genre = firstGenre && firstGenre.archivedAt === null ? firstGenre : null

  const [author, seriesPart, genreBooks] = await Promise.all([
    firstAuthor ? authorPart(db, firstAuthor.slug, book.id) : null,
    firstSeries
      ? loadSeriesEntries(db, firstSeries.series, book.slug).then(({ items, total }) =>
          items.length === 0
            ? null
            : {
                slug: firstSeries.series.slug,
                name: firstSeries.series.name,
                memberCount: firstSeries.series.sourceMemberCount,
                total,
                items,
              },
        )
      : null,
    genre
      ? genreBookIds(db, genre.id, {
          sort: 'top_rated',
          siteMean,
          limit: RELATED_BOOKS_LIMIT,
          excludeBookId: book.id,
        }).then((ids) => loadBookSummaries(db, ids))
      : null,
  ])
  return {
    author,
    series: seriesPart,
    genre:
      genre && genreBooks && genreBooks.length > 0
        ? { slug: genre.slug, name: genre.name, books: genreBooks }
        : null,
  }
}
