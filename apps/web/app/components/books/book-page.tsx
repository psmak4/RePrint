import type {
  BookDetail,
  BookReviewsResponse,
  BookSummary,
  Cover as CoverData,
  Edition,
  MyReview,
  Viewer,
} from '@reprint/shared'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { copy } from '../../copy/index.js'
import { groupContributors } from '../../lib/contributors.js'
import { coverUrl } from '../../lib/cover-url.js'
import { type ReviewListQuery, reviewsHref } from '../../lib/review-links.js'
import { MyReviewSection } from '../reviews/my-review-section.js'
import { ReviewsList } from '../reviews/reviews-list.js'
import { AuthorCard } from './author-card.js'
import { BookRail } from './book-rail.js'
import { Cover } from './cover.js'
import { DetailsList } from './details-list.js'
import { EditionsCard } from './editions-card.js'
import { FactsRow } from './facts-row.js'
import { summaryCard } from './genre-pages.js'
import { RatingBreakdown } from './rating-breakdown.js'
import { SectionNav, type SectionNavItem } from './section-nav.js'
import { SeriesCard, type SeriesCardBook } from './series-card.js'
import { BookShelfSelector } from './shelf-selector.js'
import { StarRating } from './star-rating.js'

const { page: text } = copy.books
const labels = copy.redesign.bookPage

/** Long enough that it will probably pass 6 lines; the toggle only appears then. */
const COLLAPSE_AFTER_CHARACTERS = 320

export type MoreByAuthor = { authorName: string; authorSlug: string; books: BookSummary[] }
export type MoreInGenre = { genreName: string; genreSlug: string; books: BookSummary[] }
export type AuthorSummary = {
  name: string
  slug: string
  photo: CoverData | null
  born: string | null
  died: string | null
  bio: string | null
  bookCount: number
}
export type SeriesSummary = {
  name: string
  slug: string
  total: number
  books: SeriesCardBook[]
}

const languageName = (code: string) =>
  new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code

export function BookPage({
  book,
  editions,
  moreByAuthor,
  author = null,
  series = null,
  moreInGenre = null,
  viewer = null,
  myReview = null,
  reviews = null,
  reviewQuery = { sort: 'most_helpful', page: 1 },
  votedReviewIds = [],
}: {
  book: BookDetail
  editions: Edition[]
  moreByAuthor: MoreByAuthor | null
  author?: AuthorSummary | null
  series?: SeriesSummary | null
  moreInGenre?: MoreInGenre | null
  viewer?: Viewer | null
  myReview?: MyReview | null
  reviews?: BookReviewsResponse | null
  reviewQuery?: ReviewListQuery
  votedReviewIds?: string[]
}) {
  const navigate = useNavigate()
  const hasSimilar = moreByAuthor !== null || moreInGenre !== null
  const navItems: SectionNavItem[] = [
    { id: 'overview', label: labels.sections.overview },
    { id: 'reviews', label: labels.sections.reviews, count: book.rating.count },
    ...(series ? [{ id: 'series', label: labels.sections.series, count: series.total }] : []),
    ...(editions.length > 0
      ? [{ id: 'editions', label: labels.sections.editions, count: editions.length }]
      : []),
    ...(author ? [{ id: 'author', label: labels.sections.author }] : []),
    ...(hasSimilar ? [{ id: 'similar', label: labels.sections.similar }] : []),
  ]
  const rating = book.rating
  return (
    <article className="flex flex-col gap-8">
      <div className="-mt-8 bg-ground-deep py-8 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)]">
        <BookHeader book={book} series={series} signedIn={viewer !== null} />
      </div>
      <SectionNav items={navItems} />
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-8">
          <Description text={book.description} />
          <BookDetails book={book} />
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              {rating.average !== null && rating.count > 0 ? (
                <RatingBreakdown
                  average={rating.average}
                  count={rating.count}
                  distribution={rating.distribution}
                  selected={reviewQuery.rating ?? null}
                  onSelect={(stars) =>
                    navigate(
                      reviewsHref(book.slug, reviewQuery, {
                        rating: stars ?? undefined,
                        page: 1,
                      }),
                    )
                  }
                />
              ) : null}
              <div id="write-review" className="scroll-mt-16">
                <MyReviewSection viewer={viewer} myReview={myReview} editions={editions} />
              </div>
            </div>
            <ReviewsList
              slug={book.slug}
              reviews={reviews}
              query={reviewQuery}
              hasAnyReviews={rating.count > 0}
              viewer={viewer}
              votedReviewIds={votedReviewIds}
            />
          </div>
        </div>
        <aside className="flex flex-col gap-6 lg:col-span-4">
          {series ? (
            <div id="series" className="scroll-mt-16">
              <SeriesCard
                name={series.name}
                href={`/series/${series.slug}`}
                books={series.books}
                currentSlug={book.slug}
                total={series.total}
              />
            </div>
          ) : null}
          {author ? (
            <div id="author" className="scroll-mt-16">
              <AuthorCard
                name={author.name}
                href={`/authors/${author.slug}`}
                photoUrl={coverUrl(author.photo, 'small')}
                born={author.born}
                died={author.died}
                bio={author.bio}
                bookCount={author.bookCount}
              />
            </div>
          ) : null}
          {editions.length > 0 ? (
            <div id="editions" className="scroll-mt-16">
              <EditionsCard
                editions={editions.map((edition) => ({
                  id: edition.id,
                  format: edition.format,
                  publisher: edition.publisherName,
                  publishedYear: edition.publishedDate
                    ? Number(edition.publishedDate.slice(0, 4))
                    : null,
                  isbn13: edition.isbn13,
                }))}
              />
            </div>
          ) : null}
        </aside>
      </div>
      {hasSimilar ? (
        <div id="similar" className="flex scroll-mt-16 flex-col gap-8">
          {moreByAuthor ? (
            <Row
              id="more-by-author"
              heading={text.moreByHeading(moreByAuthor.authorName)}
              books={moreByAuthor.books}
            />
          ) : null}
          {moreInGenre ? (
            <Row
              id="more-in-genre"
              heading={labels.moreInGenre(moreInGenre.genreName)}
              books={moreInGenre.books}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function Row({ id, heading, books }: { id: string; heading: string; books: BookSummary[] }) {
  if (books.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="font-serif text-2xl font-medium">
        {heading}
      </h2>
      <BookRail
        label={heading}
        items={books.map((book) => ({ slug: book.slug, book: summaryCard(book) }))}
      />
    </section>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center rounded-md border border-input-border bg-surface px-4 text-sm font-medium hover:bg-surface-raised"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(window.location.href.split('#')[0] ?? window.location.href)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
    >
      {copied ? labels.linkCopied : labels.copyLink}
      <span role="status" className="sr-only">
        {copied ? labels.linkCopied : ''}
      </span>
    </button>
  )
}

function BookHeader({
  book,
  series,
  signedIn,
}: {
  book: BookDetail
  series: SeriesSummary | null
  signedIn: boolean
}) {
  const groups = groupContributors(book.contributions)
  const edition = book.primaryEdition
  const membership = book.series[0]
  const firstGenre = book.genres[0]
  type Fact = { label: string; value: string }
  const candidates: (Fact | null)[] = [
    book.firstPublishedYear
      ? { label: labels.facts.firstPublished, value: String(book.firstPublishedYear) }
      : null,
    edition?.pageCount ? { label: labels.facts.pages, value: String(edition.pageCount) } : null,
    edition?.publisherName ? { label: labels.facts.publisher, value: edition.publisherName } : null,
    book.originalLanguage
      ? { label: labels.facts.originalLanguage, value: languageName(book.originalLanguage) }
      : null,
    book.editionCount > 0
      ? { label: labels.facts.editions, value: String(book.editionCount) }
      : null,
  ]
  const facts = candidates.filter((fact): fact is Fact => fact !== null)

  return (
    <header className="flex flex-col gap-4">
      <nav aria-label={labels.breadcrumbLabel} className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <Link to="/" className="underline">
              {labels.discover}
            </Link>
          </li>
          {firstGenre ? (
            <li className="flex gap-2">
              <span aria-hidden="true">›</span>
              <Link to={`/genres/${firstGenre.slug}`} className="underline">
                {firstGenre.name}
              </Link>
            </li>
          ) : null}
          <li className="flex gap-2">
            <span aria-hidden="true">›</span>
            <span aria-current="page">{book.title}</span>
          </li>
        </ol>
      </nav>
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-start lg:gap-10">
        <Cover
          cover={book.cover ?? edition?.cover ?? null}
          title={book.title}
          authorName={groups[0]?.people[0]?.name}
          slug={book.slug}
          size="large"
          className="shrink-0 shadow-md lg:w-72"
        />
        <div className="flex min-w-0 flex-col gap-3">
          {membership ? (
            <p>
              <Link
                to={`/series/${membership.series.slug}`}
                className="inline-block rounded-full bg-surface px-3 py-1 text-sm text-link underline"
              >
                {labels.seriesPill(
                  membership.series.name,
                  membership.position === null ? null : String(membership.position),
                  series?.total ?? null,
                )}
              </Link>
            </p>
          ) : null}
          <h1 className="font-serif text-[38px] leading-10 font-medium tracking-[-0.02em] break-words lg:text-6xl lg:leading-[62px]">
            {book.title}
          </h1>
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
          <RatingRow rating={book.rating} />
          <FactsRow facts={facts} />
          <div className="flex flex-wrap items-center gap-3">
            <BookShelfSelector book={book} signedIn={signedIn} />
            <a
              href="#write-review"
              className="inline-flex h-11 items-center rounded-md border border-input-border bg-surface px-4 text-sm font-medium hover:bg-surface-raised"
            >
              {labels.writeReview}
            </a>
            <CopyLinkButton />
          </div>
          {book.genres.length > 0 ? (
            <ul aria-label={text.genresLabel} className="flex flex-wrap gap-2">
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
      </div>
    </header>
  )
}

function RatingRow({ rating }: { rating: BookDetail['rating'] }) {
  if (rating.average === null || rating.count === 0) {
    return <p className="text-sm text-muted-foreground">{copy.books.noReviews}</p>
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <StarRating average={rating.average} className="text-lg" />
      <span className="font-semibold">{rating.average.toFixed(1)}</span>
      <a href="#reviews" className="text-link underline">
        {labels.reviewsLink(rating.count)}
      </a>
    </p>
  )
}

function BookDetails({ book }: { book: BookDetail }) {
  const edition = book.primaryEdition
  const translators = groupContributors(book.contributions)
    .find((group) => group.role === 'translator')
    ?.people.map((person) => person.name)
    .join(', ')
  const rows = [
    { label: labels.details.format, value: edition ? text.formats[edition.format] : null },
    { label: labels.details.published, value: edition?.publishedDate },
    { label: labels.details.publisher, value: edition?.publisherName },
    { label: labels.details.pages, value: edition?.pageCount ? String(edition.pageCount) : null },
    {
      label: labels.details.language,
      value: edition?.language ? languageName(edition.language) : null,
    },
    {
      label: labels.details.originalLanguage,
      value: book.originalLanguage ? languageName(book.originalLanguage) : null,
    },
    { label: labels.details.isbn13, value: edition?.isbn13 },
    { label: labels.details.translators, value: translators },
  ]
  if (!rows.some((row) => row.value)) return null
  return (
    <section aria-labelledby="book-details" className="flex flex-col gap-3">
      <h2 id="book-details" className="font-serif text-2xl font-medium">
        {labels.detailsHeading}
      </h2>
      <DetailsList rows={rows} />
    </section>
  )
}

function Description({ text: description }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const body = description?.trim() ?? ''
  const collapsible = body.length > COLLAPSE_AFTER_CHARACTERS || body.split('\n').length > 6
  return (
    <section id="overview" aria-labelledby="book-description" className="scroll-mt-16">
      <h2 id="book-description" className="font-serif text-2xl font-medium">
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
