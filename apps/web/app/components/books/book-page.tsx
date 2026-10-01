import type {
  BookDetail,
  BookReviewsResponse,
  BookSummary,
  Edition,
  MyReview,
  Viewer,
} from '@reprint/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { groupContributors } from '../../lib/contributors.js'
import type { ReviewListQuery } from '../../lib/review-links.js'
import { MyReviewSection } from '../reviews/my-review-section.js'
import { RatingSummary } from '../reviews/rating-summary.js'
import { ReviewsList } from '../reviews/reviews-list.js'
import { Cover } from './cover.js'
import { RatingDisplay } from './rating-display.js'

const { page: text } = copy.books

/** Long enough that it will probably pass 6 lines; the toggle only appears then. */
const COLLAPSE_AFTER_CHARACTERS = 320

export type MoreByAuthor = { authorName: string; authorSlug: string; books: BookSummary[] }

export function BookPage({
  book,
  editions,
  moreByAuthor,
  viewer = null,
  myReview = null,
  reviews = null,
  reviewQuery = { sort: 'most_helpful', page: 1 },
}: {
  book: BookDetail
  editions: Edition[]
  moreByAuthor: MoreByAuthor | null
  viewer?: Viewer | null
  myReview?: MyReview | null
  reviews?: BookReviewsResponse | null
  reviewQuery?: ReviewListQuery
}) {
  return (
    <article className="flex flex-col gap-8">
      <BookHeader book={book} />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <Description text={book.description} />
          <MyReviewSection viewer={viewer} myReview={myReview} editions={editions} />
          <RatingSummary slug={book.slug} rating={book.rating} query={reviewQuery} />
          <ReviewsList
            slug={book.slug}
            reviews={reviews}
            query={reviewQuery}
            hasAnyReviews={book.rating.count > 0}
          />
        </div>
        <aside className="flex flex-col gap-8 lg:col-span-4">
          <EditionsList editions={editions} />
          {moreByAuthor ? <MoreBy {...moreByAuthor} /> : null}
        </aside>
      </div>
    </article>
  )
}

function BookHeader({ book }: { book: BookDetail }) {
  const groups = groupContributors(book.contributions)
  const edition = book.primaryEdition
  const meta = [
    book.firstPublishedYear ? copy.books.firstPublished(book.firstPublishedYear) : null,
    edition?.pageCount ? text.pages(edition.pageCount) : null,
    edition?.publisherName ? text.publisher(edition.publisherName) : null,
  ].filter((row): row is string => row !== null)

  return (
    <header className="flex flex-col gap-6 sm:flex-row">
      <Cover
        cover={book.cover ?? edition?.cover ?? null}
        title={book.title}
        authorName={groups[0]?.people[0]?.name}
        size="large"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-3xl font-semibold break-words">{book.title}</h1>
        {book.subtitle ? <p className="text-lg text-muted-foreground">{book.subtitle}</p> : null}
        {groups.map((group) => (
          <p key={group.role} className="text-base">
            {text.roles[group.role]}{' '}
            {group.people.map((person, i) => (
              <span key={person.slug}>
                {i > 0 ? ', ' : ''}
                <Link to={`/authors/${person.slug}`} className="text-link underline">
                  {person.name}
                </Link>
              </span>
            ))}
          </p>
        ))}
        {book.series.map((membership) => (
          <p key={membership.series.slug} className="text-sm">
            <Link to={`/series/${membership.series.slug}`} className="text-link underline">
              {membership.position === null
                ? membership.series.name
                : text.seriesPosition(membership.series.name, membership.position)}
            </Link>
          </p>
        ))}
        {meta.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {meta.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        ) : null}
        <RatingDisplay rating={book.rating} />
        {book.genres.length > 0 ? (
          <ul aria-label={text.genresLabel} className="mt-1 flex flex-wrap gap-2">
            {book.genres.map((genre) => (
              <li key={genre.slug}>
                <Link
                  to={`/genres/${genre.slug}`}
                  className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-sm"
                >
                  {genre.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </header>
  )
}

function Description({ text: description }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const body = description?.trim() ?? ''
  const collapsible = body.length > COLLAPSE_AFTER_CHARACTERS || body.split('\n').length > 6
  return (
    <section aria-labelledby="book-description">
      <h2 id="book-description" className="text-xl font-semibold">
        {text.descriptionHeading}
      </h2>
      {body ? (
        <>
          <p
            id="book-description-text"
            className={`mt-2 whitespace-pre-line ${collapsible && !expanded ? 'line-clamp-6' : ''}`}
          >
            {body}
          </p>
          {collapsible ? (
            <button
              type="button"
              className="mt-2 text-sm text-link underline"
              aria-expanded={expanded}
              aria-controls="book-description-text"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? text.readLess : text.readMore}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-muted-foreground">{text.noDescription}</p>
      )}
    </section>
  )
}

function EditionsList({ editions }: { editions: Edition[] }) {
  if (editions.length === 0) return null
  return (
    <section>
      <details className="rounded-lg border border-border bg-surface p-4">
        <summary className="cursor-pointer text-lg font-semibold">
          {text.editionsHeading(editions.length)}
        </summary>
        <ul className="mt-3 flex flex-col gap-3">
          {editions.map((edition) => {
            const details = [
              edition.publishedDate?.slice(0, 4),
              edition.publisherName,
              edition.isbn13 ? text.isbn(edition.isbn13) : null,
            ].filter((row): row is string => Boolean(row))
            return (
              <li key={edition.id} className="text-sm">
                <span className="font-medium">{text.formats[edition.format]}</span>
                {details.length > 0 ? (
                  <span className="text-muted-foreground"> · {details.join(' · ')}</span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}

function MoreBy({ authorName, books }: MoreByAuthor) {
  if (books.length === 0) return null
  return (
    <section aria-labelledby="more-by-author">
      <h2 id="more-by-author" className="text-lg font-semibold">
        {text.moreByHeading(authorName)}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {books.map((book) => (
          <li key={book.id} className="flex gap-3">
            <Cover cover={book.cover} title={book.title} authorName={authorName} size="small" />
            <div className="flex min-w-0 flex-col gap-1">
              <Link to={`/books/${book.slug}`} className="text-link underline">
                {book.title}
              </Link>
              <RatingDisplay rating={book.rating} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
