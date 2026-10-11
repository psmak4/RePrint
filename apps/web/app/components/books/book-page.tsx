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
  /**
   * True when RePrint has every Book at positions 1 to `total`, so "Book 2 of 3" is true. A Series
   * RePrint holds only part of says "Book 2" instead.
   */
  complete: boolean
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
  // The Source may know of more Editions than the Catalog stores (D-191).
  const knownEditions = Math.max(book.sourceEditionCount ?? 0, book.editionCount)
  const navItems: SectionNavItem[] = [
    { id: 'overview', label: labels.sections.overview },
    { id: 'reviews', label: labels.sections.reviews, count: book.rating.count },
    ...(series ? [{ id: 'series', label: labels.sections.series, count: series.total }] : []),
    ...(editions.length > 0
      ? [{ id: 'editions', label: labels.sections.editions, count: knownEditions }]
      : []),
    ...(author ? [{ id: 'author', label: labels.sections.author }] : []),
    ...(hasSimilar ? [{ id: 'similar', label: labels.sections.similar }] : []),
  ]
  const rating = book.rating
  const rated = rating.average !== null && rating.count > 0
  return (
    <article className="flex flex-col">
      <div className="-mt-8 bg-ground-deep pt-6 pb-7 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:pt-7 md:pb-14">
        <BookHeader book={book} series={series} signedIn={viewer !== null} />
      </div>
      <SectionNav items={navItems} />
      <div className="grid gap-12 pt-9 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-14 lg:pt-12">
        <div className="flex min-w-0 flex-col gap-12 lg:gap-16">
          <Description text={book.description} />
          <BookDetails book={book} />
          <ReviewsList
            slug={book.slug}
            reviews={reviews}
            query={reviewQuery}
            hasAnyReviews={rating.count > 0}
            viewer={viewer}
            votedReviewIds={votedReviewIds}
            summary={
              // While the review form is open, the panel takes the card's full width (`:has`).
              <div
                className={`grid items-center gap-6 rounded-2xl border border-border bg-surface p-[18px] md:p-7 ${rated ? 'xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-7 xl:has-[form]:grid-cols-1' : ''}`}
              >
                {rated && rating.average !== null ? (
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
                <div id="write-review" className="scroll-mt-20">
                  <MyReviewSection viewer={viewer} myReview={myReview} editions={editions} />
                </div>
              </div>
            }
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          {series ? (
            <div id="series" className="scroll-mt-16">
              <SeriesCard
                name={series.name}
                href={`/series/${series.slug}`}
                books={series.books}
                currentSlug={book.slug}
                total={series.complete ? series.total : null}
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
                known={knownEditions}
                editions={editions.map((edition) => ({
                  id: edition.id,
                  primary: edition.id === book.primaryEdition?.id,
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
        <div
          id="similar"
          className="flex scroll-mt-16 flex-col gap-14 pt-12 md:gap-[72px] md:pt-16"
        >
          {moreByAuthor ? (
            <Row
              id="more-by-author"
              heading={text.moreByHeading(moreByAuthor.authorName)}
              books={moreByAuthor.books}
              action={
                author ? (
                  <Link
                    to={`/authors/${moreByAuthor.authorSlug}`}
                    className="text-[15px] font-semibold text-link hover:underline"
                  >
                    {labels.allBooks(author.bookCount)}
                  </Link>
                ) : null
              }
            />
          ) : null}
          {moreInGenre ? (
            <Row
              id="more-in-genre"
              heading={labels.moreInGenre(moreInGenre.genreName)}
              books={moreInGenre.books}
              action={
                <Link
                  to={`/genres/${moreInGenre.genreSlug}`}
                  className="text-[15px] font-semibold text-link hover:underline"
                >
                  {labels.browseGenre(moreInGenre.genreName)}
                </Link>
              }
            />
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function Row({
  id,
  heading,
  books,
  action,
}: {
  id: string
  heading: string
  books: BookSummary[]
  action?: ReactNode
}) {
  if (books.length === 0) return null
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2
          id={id}
          className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
        >
          {heading}
        </h2>
        {action}
      </div>
      <BookRail
        columns={6}
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
      aria-label={copied ? labels.linkCopied : labels.copyLink}
      className="inline-flex size-11 items-center justify-center rounded-full border border-input-border bg-surface text-foreground hover:bg-surface-raised"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(window.location.href.split('#')[0] ?? window.location.href)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </>
        )}
      </svg>
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
      ? {
          label: labels.facts.editions,
          value: String(Math.max(book.sourceEditionCount ?? 0, book.editionCount)),
        }
      : null,
  ]
  const facts = candidates.filter((fact): fact is Fact => fact !== null)

  return (
    <header className="flex flex-col gap-6 md:gap-8">
      <nav aria-label={labels.breadcrumbLabel} className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li>
            <Link to="/" className="text-[#334155] hover:underline">
              {labels.discover}
            </Link>
          </li>
          {firstGenre ? (
            <li className="flex gap-2">
              <span aria-hidden="true">/</span>
              <Link to={`/genres/${firstGenre.slug}`} className="text-[#334155] hover:underline">
                {firstGenre.name}
              </Link>
            </li>
          ) : null}
          <li className="flex gap-2">
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              {book.title}
            </span>
          </li>
        </ol>
      </nav>
      <div className="flex flex-col items-center gap-[18px] text-center md:grid md:grid-cols-[200px_minmax(0,1fr)] md:items-start md:gap-8 md:text-left lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
        <Cover
          cover={book.cover ?? edition?.cover ?? null}
          title={book.title}
          authorName={groups[0]?.people[0]?.name}
          slug={book.slug}
          size="large"
          raised
          priority
          className="w-44 md:w-full"
        />
        <div className="flex w-full min-w-0 flex-col items-center gap-[18px] md:items-start md:gap-[22px] md:pt-2">
          {membership ? (
            <Link
              to={`/series/${membership.series.slug}`}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-[#d9d4ca] bg-surface px-3 text-[13px] text-[#1e293b] hover:border-input-border"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-[15px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              {labels.seriesPill(
                membership.series.name,
                membership.position === null ? null : String(membership.position),
                series?.complete ? series.total : null,
              )}
            </Link>
          ) : null}
          <div className="flex flex-col gap-2.5">
            <h1 className="font-serif text-[38px] leading-[1.04] font-medium tracking-[-0.02em] break-words lg:text-6xl lg:leading-[1.02]">
              {book.title}
            </h1>
            {book.subtitle ? (
              <p className="text-lg text-muted-foreground">{book.subtitle}</p>
            ) : null}
            {groups.length > 0 ? (
              <p className="text-base text-[#334155] md:text-lg">
                {groups.map((group, g) => (
                  <span key={group.role}>
                    {g > 0 ? <span className="text-muted-foreground"> · </span> : null}
                    <span className={g > 0 ? 'text-muted-foreground' : ''}>
                      {text.roles[group.role]}
                    </span>{' '}
                    {group.people.map((person, i) => (
                      <span key={person.slug}>
                        {i > 0 ? ', ' : ''}
                        <Link
                          to={`/authors/${person.slug}`}
                          className="font-semibold text-foreground underline underline-offset-2"
                        >
                          {person.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <RatingRow rating={book.rating} />
          <div className="w-full md:w-auto">
            <FactsRow facts={facts} />
          </div>
          <div className="grid w-full grid-cols-2 gap-2.5 md:flex md:w-auto md:flex-wrap md:items-center md:gap-3">
            <BookShelfSelector book={book} signedIn={signedIn} variant="primary" />
            <a
              href="#write-review"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-input-border bg-surface px-5 text-[15px] font-semibold whitespace-nowrap hover:bg-surface-raised"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              {labels.writeReview}
            </a>
            <span className="hidden md:inline-flex">
              <CopyLinkButton />
            </span>
          </div>
          {book.genres.length > 0 ? (
            <ul
              aria-label={text.genresLabel}
              className="flex flex-wrap justify-center gap-2 md:justify-start"
            >
              {book.genres.map((genre) => (
                <li key={genre.slug}>
                  <Link
                    to={`/genres/${genre.slug}`}
                    className="inline-flex h-[34px] items-center rounded-full border border-[#d9d4ca] bg-surface px-3.5 text-sm text-[#1e293b] hover:border-input-border"
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
    <p className="flex flex-wrap items-center justify-center gap-2.5 md:justify-start md:gap-3.5">
      <StarRating average={rating.average} className="text-xl md:text-[26px]" />
      <span className="text-lg font-semibold md:text-2xl">{rating.average.toFixed(1)}</span>
      <a href="#reviews" className="text-base text-link underline">
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="book-details"
          className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
        >
          {labels.detailsHeading}
        </h2>
        <span className="text-sm text-muted-foreground">{labels.fromPrimaryEdition}</span>
      </div>
      <DetailsList rows={rows} />
    </section>
  )
}

function Description({ text: description }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const body = description?.trim() ?? ''
  const collapsible = body.length > COLLAPSE_AFTER_CHARACTERS || body.split('\n').length > 6
  return (
    <section
      id="overview"
      aria-labelledby="book-description"
      className="flex scroll-mt-16 flex-col gap-4"
    >
      <h2
        id="book-description"
        className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] md:text-[32px]"
      >
        {text.descriptionHeading}
      </h2>
      {body ? (
        <>
          <p
            id="book-description-text"
            className={`font-serif text-lg leading-[1.6] whitespace-pre-line text-[#1e293b] md:text-[19px] md:leading-[1.65] ${collapsible && !expanded ? 'line-clamp-6' : ''}`}
          >
            {body}
          </p>
          {collapsible ? (
            <button
              type="button"
              className="self-start py-1 text-[15px] font-semibold text-link underline underline-offset-[3px]"
              aria-expanded={expanded}
              aria-controls="book-description-text"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? text.readLess : text.readMore}
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground">{text.noDescription}</p>
      )}
    </section>
  )
}
