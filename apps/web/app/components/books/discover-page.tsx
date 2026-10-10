import type {
  BookSummary,
  DiscoverResponse,
  LibraryEntry,
  MostReviewedItem,
  Viewer,
} from '@reprint/shared'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ReviewExcerpt } from '../reviews/review-excerpt.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { SpoilerToggle } from '../reviews/spoiler-toggle.js'
import { BookRail, type BookRailItem } from './book-rail.js'
import { Cover } from './cover.js'
import { summaryCard } from './genre-pages.js'
import { GenreTile } from './genre-tile.js'
import { BookShelfSelector } from './shelf-selector.js'
import { StarRating } from './star-rating.js'
import { TrustBadge } from './trust-badge.js'

const text = copy.home

/** The viewer's Reading and Want to Read entries for the "Your reading" strip. */
export type YourReading = { reading: LibraryEntry[]; wantToRead: LibraryEntry[] }

const authorsOf = (book: BookSummary) =>
  book.contributions
    .filter((c) => c.role === 'author' || c.role === 'co_author')
    .map((c) => c.author.name)

function railItems(
  books: BookSummary[],
  signedIn: boolean,
  note?: (book: BookSummary) => string,
): BookRailItem[] {
  return books.map((book) => ({
    slug: book.slug,
    book: summaryCard(book),
    note: note?.(book),
    shelf: <BookShelfSelector book={book} signedIn={signedIn} />,
  }))
}

function Section({
  id,
  heading,
  note,
  action,
  children,
}: {
  id: string
  heading: string
  note?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-1">
          <h2
            id={id}
            className="font-serif text-[26px] leading-[30px] font-medium md:text-4xl md:leading-10"
          >
            {heading}
          </h2>
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function FeaturedReview({
  featured,
}: {
  featured: NonNullable<DiscoverResponse['featuredReview']>
}) {
  const { review, book } = featured
  const body = <ReviewBody body={review.body} />
  return (
    <section
      aria-labelledby="discover-featured-review"
      className="flex gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <Cover
        cover={book.cover}
        title={book.title}
        authorName={authorsOf(book)[0]}
        slug={book.slug}
        size="medium"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <h2
          id="discover-featured-review"
          className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase md:text-[13px]"
        >
          {text.featuredReview}
        </h2>
        <p className="text-sm text-muted-foreground">
          {text.featuredReviewOn}{' '}
          <Link to={`/books/${book.slug}`} className="text-link underline">
            {book.title}
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StarRating average={review.rating} className="text-sm" />
          {review.headline ? (
            <h3 className="font-serif text-xl leading-6 font-medium">{review.headline}</h3>
          ) : null}
        </div>
        {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
        <p className="text-sm text-muted-foreground">
          <Link to={`/u/${review.author.username}`} className="text-link underline">
            {copy.reviews.list.by(review.author.displayName)}
          </Link>
        </p>
        <Link to={`/books/${book.slug}#reviews`} className="text-sm text-link underline">
          {text.readMore}
        </Link>
      </div>
    </section>
  )
}

function Hero({ discover }: { discover: DiscoverResponse }) {
  const tries = (discover.featuredGenres ?? []).slice(0, 3)
  return (
    // The band reaches the viewport edges with a box-shadow, so the page needs no horizontal scroll.
    <div className="-mt-8 bg-ground-deep py-12 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)]">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="flex flex-col items-start gap-4 lg:col-span-7">
          <TrustBadge />
          <h1 className="font-serif text-[40px] leading-[42px] font-medium tracking-[-0.02em] md:text-[64px] md:leading-[66px]">
            {text.title}
          </h1>
          <p className="text-base md:text-[19px] md:leading-[29px]">{text.lead}</p>
          <search aria-label={text.hero.searchLabel} className="w-full">
            <form action="/search" method="get" className="flex w-full gap-2">
              <input
                type="search"
                name="q"
                aria-label={text.hero.queryLabel}
                placeholder={text.hero.placeholder}
                className="h-[60px] min-w-0 flex-1 rounded-lg border border-input-border bg-surface px-4 text-base"
              />
              <button
                type="submit"
                className="h-[60px] rounded-lg bg-accent px-6 font-medium text-accent-foreground hover:bg-accent-hover"
              >
                {text.hero.submit}
              </button>
            </form>
          </search>
          {tries.length > 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{text.hero.try}</span>
              {tries.map((genre) => (
                <Link
                  key={genre.slug}
                  to={`/genres/${genre.slug}`}
                  className="rounded-full border border-border bg-surface px-3 py-1 hover:bg-surface-raised"
                >
                  {genre.name}
                </Link>
              ))}
            </p>
          ) : null}
        </div>
        {discover.featuredReview ? (
          <div className="lg:col-span-5">
            <FeaturedReview featured={discover.featuredReview} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function YourReadingStrip({ username, reading }: { username: string; reading: YourReading }) {
  const t = text.yourReading
  const entries = [...reading.reading, ...reading.wantToRead.slice(0, 1)]
  return (
    <Section id="discover-your-reading" heading={t.heading}>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(({ book, shelf }) => (
          <li key={book.id} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
            <Cover
              cover={book.cover}
              title={book.title}
              authorName={authorsOf(book)[0]}
              slug={book.slug}
              size="small"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {shelf === 'reading' ? t.reading : t.wantToRead}
              </p>
              <Link
                to={`/books/${book.slug}`}
                className="font-serif text-base leading-5 font-medium hover:underline"
              >
                {book.title}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {t.finishedPrompt}{' '}
        <Link to={`/u/${username}/library?shelf=read`} className="text-link underline">
          {t.writeReview}
        </Link>
      </p>
    </Section>
  )
}

function MostReviewed({ books, signedIn }: { books: MostReviewedItem[]; signedIn: boolean }) {
  const t = text.thisMonth
  return (
    <Section id="discover-month" heading={t.mostReviewedHeading}>
      <ol className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {books.slice(0, 7).map((book, i) => (
          <li key={book.id} className="flex items-center gap-3 p-3">
            <span aria-hidden="true" className="w-6 text-center font-serif text-xl">
              {i + 1}
            </span>
            <Cover
              cover={book.cover}
              title={book.title}
              authorName={authorsOf(book)[0]}
              slug={book.slug}
              size="small"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                to={`/books/${book.slug}`}
                className="font-serif text-base leading-5 font-medium hover:underline"
              >
                {book.title}
              </Link>
              <span className="text-sm text-muted-foreground">{authorsOf(book).join(', ')}</span>
              <span className="text-sm text-muted-foreground">
                {t.newReviews(book.recentReviewCount)}
              </span>
            </div>
            <BookShelfSelector book={book} signedIn={signedIn} />
          </li>
        ))}
      </ol>
    </Section>
  )
}

function JustApproved({ items }: { items: NonNullable<DiscoverResponse['justApproved']> }) {
  const t = text.thisMonth
  return (
    <Section id="discover-just-approved" heading={t.justApprovedHeading} note={t.justApprovedNote}>
      <ul className="flex flex-col gap-4">
        {items.map(({ review, book }) => (
          <li key={`${book.id}-${review.id}`}>
            <ReviewExcerpt
              review={{
                rating: review.rating,
                headline: review.headline,
                excerpt: review.excerpt,
                authorName: review.author.displayName,
              }}
              book={{
                slug: book.slug,
                title: book.title,
                cover: book.cover,
                authorName: authorsOf(book)[0] ?? null,
              }}
              href={`/books/${book.slug}#reviews`}
            />
          </li>
        ))}
      </ul>
    </Section>
  )
}

function SignUpPitch() {
  const t = text.pitch
  return (
    <section
      aria-labelledby="discover-pitch"
      className="flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6"
    >
      <h2 id="discover-pitch" className="font-serif text-[26px] leading-[30px] font-medium">
        {t.heading}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>{t.shelves}</li>
        <li>{t.reviews}</li>
        <li>{t.helpful}</li>
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/register"
          className="inline-flex h-11 items-center rounded-lg bg-accent px-6 font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {t.create}
        </Link>
        <Link to="/login" className="text-link underline">
          {t.logIn}
        </Link>
      </div>
    </section>
  )
}

function HowItWorks() {
  const t = text.howItWorks
  return (
    <section aria-labelledby="discover-how" className="flex flex-col gap-4">
      <h2
        id="discover-how"
        className="font-serif text-[26px] leading-[30px] font-medium md:text-[32px] md:leading-9"
      >
        {t.heading}
      </h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {t.steps.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-1 rounded-lg bg-ground-deep p-4">
            <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {i + 1}
            </span>
            <h3 className="font-serif text-[21px] leading-[26px] font-medium">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link to="/community-guidelines" className="text-link underline">
        {t.guidelines}
      </Link>
    </section>
  )
}

/**
 * `/`: the Discover template (docs/DESIGN.md). A hidden row is `null` and leaves no heading or gap
 * (PRD §7.2). "Your reading" is for Members with a Reading or Want to Read entry, and the sign-up
 * pitch is for Visitors.
 */
export function DiscoverPage({
  discover,
  viewer,
  reading = null,
}: {
  discover: DiscoverResponse
  viewer: Viewer | null
  reading?: YourReading | null
}) {
  const signedIn = viewer !== null
  const hasContent = Object.values(discover).some((row) => row !== null)
  const showReading = reading !== null && reading.reading.length + reading.wantToRead.length > 0
  return (
    <div className="flex flex-col gap-12">
      <Hero discover={discover} />
      {hasContent ? null : <p className="text-muted-foreground">{text.empty}</p>}
      {viewer && reading && showReading ? (
        <YourReadingStrip username={viewer.username} reading={reading} />
      ) : null}
      {discover.featuredGenres ? (
        <Section
          id="discover-genres"
          heading={text.browseByGenre}
          note={text.genresNote}
          action={
            <Link to="/genres" className="text-link underline">
              {text.allGenres}
            </Link>
          }
        >
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {discover.featuredGenres.slice(0, 12).map((genre) => (
              <li key={genre.slug}>
                <GenreTile name={genre.name} href={`/genres/${genre.slug}`} books={[]} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {discover.topRated ? (
        <Section id="discover-top" heading={text.topRated} note={text.topRatedNote}>
          <BookRail
            label={text.topRated}
            items={railItems(discover.topRated.slice(0, 7), signedIn)}
          />
        </Section>
      ) : null}
      {discover.recentlyReviewed ? (
        <Section id="discover-recent" heading={text.recentlyReviewed}>
          <BookRail
            label={text.recentlyReviewed}
            items={railItems(discover.recentlyReviewed.slice(0, 7), signedIn)}
          />
        </Section>
      ) : null}
      {discover.mostReviewedThisMonth || discover.justApproved ? (
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          {discover.mostReviewedThisMonth ? (
            <div className="lg:col-span-7">
              <MostReviewed books={discover.mostReviewedThisMonth} signedIn={signedIn} />
            </div>
          ) : null}
          {discover.justApproved ? (
            <div className="lg:col-span-5">
              <JustApproved items={discover.justApproved} />
            </div>
          ) : null}
        </div>
      ) : null}
      {signedIn ? null : <SignUpPitch />}
      <HowItWorks />
    </div>
  )
}
