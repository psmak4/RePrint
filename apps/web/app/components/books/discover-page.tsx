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
import { generatedCoverClass } from '../../lib/cover-color.js'
import { ReviewExcerpt } from '../reviews/review-excerpt.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { SpoilerToggle } from '../reviews/spoiler-toggle.js'
import { InitialsAvatar } from './avatar.js'
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

function railItems(books: BookSummary[], signedIn: boolean): BookRailItem[] {
  return books.map((book) => ({
    slug: book.slug,
    book: summaryCard(book),
    shelf: <BookShelfSelector book={book} signedIn={signedIn} variant="icon" />,
  }))
}

function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

const actionLink =
  'inline-flex items-center gap-1.5 text-[15px] font-semibold text-link hover:underline'

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
    <section aria-labelledby={id} className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="flex flex-col gap-1.5">
          <h2
            id={id}
            className="font-serif text-[28px] leading-[1.1] font-medium tracking-[-0.01em] md:text-4xl"
          >
            {heading}
          </h2>
          {note ? <p className="text-sm text-muted-foreground md:text-base">{note}</p> : null}
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
    <article
      aria-labelledby="discover-featured-review"
      className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-5 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.35)] md:gap-5 md:rounded-[20px] md:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="discover-featured-review"
          className="text-xs font-semibold tracking-[0.12em] text-warning uppercase md:text-[13px]"
        >
          {text.featuredReview}
        </h2>
        <span className="hidden text-[13px] text-muted-foreground sm:inline">
          {text.featuredChosen}
        </span>
      </div>
      <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 md:grid-cols-[132px_minmax(0,1fr)] md:gap-6">
        <Link
          to={`/books/${book.slug}`}
          aria-label={copy.books.coverAlt(book.title)}
          className="self-start"
        >
          <Cover
            cover={book.cover}
            title={book.title}
            authorName={authorsOf(book)[0]}
            slug={book.slug}
            size="medium"
            className="w-full"
          />
        </Link>
        <div className="flex min-w-0 flex-col gap-2.5">
          <StarRating average={review.rating} className="text-[15px] md:text-lg" />
          {review.headline ? (
            <h3 className="font-serif text-[21px] leading-[1.15] font-medium md:text-[26px]">
              {copy.redesign.reviewExcerpt.quoted(review.headline)}
            </h3>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {text.featuredReviewOn}{' '}
            <Link to={`/books/${book.slug}`} className="text-link underline">
              {book.title}
            </Link>
          </p>
          <div className="line-clamp-6 text-[15px] leading-[1.6] text-[#334155]">
            {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Link
          to={`/u/${review.author.username}`}
          className="flex items-center gap-2.5 text-sm font-semibold text-foreground hover:underline"
        >
          <InitialsAvatar
            name={review.author.displayName}
            colorKey={review.author.username}
            size="sm"
          />
          {review.author.displayName}
        </Link>
        <Link to={`/books/${book.slug}#reviews`} className={actionLink}>
          {text.readMore}
          <ArrowRight />
        </Link>
      </div>
    </article>
  )
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[22px] shrink-0 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function Hero({ discover }: { discover: DiscoverResponse }) {
  const tries = (discover.featuredGenres ?? []).slice(0, 4)
  const t = text.hero
  return (
    // The band reaches the viewport edges with a box-shadow, so the page needs no horizontal scroll.
    <div className="-mt-8 border-b border-border bg-ground-deep pt-7 pb-9 shadow-[0_0_0_100vmax_var(--color-ground-deep)] [clip-path:inset(0_-100vmax)] md:pt-[72px] md:pb-[88px]">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-16">
        <div className="flex flex-col items-start gap-[18px] lg:col-span-7 lg:gap-7">
          <TrustBadge label={t.trust} className="hidden sm:inline-flex" />
          <TrustBadge label={t.trustShort} className="sm:hidden" />
          <h1 className="font-serif text-[40px] leading-[1.05] font-medium tracking-[-0.02em] md:text-[64px] md:leading-[1.04]">
            {t.headingLead} <em className="font-medium text-warning">{t.headingEmphasis}</em>
          </h1>
          <p className="max-w-[560px] text-base leading-[1.55] text-[#334155] md:text-[19px]">
            {t.lead}
          </p>
          <search aria-label={t.searchLabel} className="hidden w-full max-w-[620px] md:block">
            <form action="/search" method="get" className="flex w-full flex-wrap gap-2.5">
              <label className="flex h-[52px] min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-full border border-input-border bg-surface px-5 shadow-[0_4px_14px_-6px_rgba(15,23,42,0.18)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring md:h-[60px]">
                <SearchIcon />
                <span className="sr-only">{t.queryLabel}</span>
                <input
                  type="search"
                  name="q"
                  placeholder={t.placeholder}
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-[17px]"
                />
              </label>
              <button
                type="submit"
                className="hidden h-[60px] rounded-full bg-accent px-7 text-base font-semibold text-accent-foreground hover:bg-accent-hover sm:block"
              >
                {t.submit}
              </button>
            </form>
          </search>
          {tries.length > 0 ? (
            <p className="hidden flex-wrap items-center gap-2 md:flex">
              <span className="mr-1 text-sm text-muted-foreground">{t.try}</span>
              {tries.map((genre) => (
                <Link
                  key={genre.slug}
                  to={`/genres/${genre.slug}`}
                  className="inline-flex h-[34px] items-center rounded-full border border-[#d9d4ca] bg-surface px-3.5 text-sm text-[#1e293b] hover:border-input-border"
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

function YourReadingStrip({ viewer, reading }: { viewer: Viewer; reading: YourReading }) {
  const t = text.yourReading
  const entries = [...reading.reading.slice(0, 2), ...reading.wantToRead.slice(0, 1)].slice(0, 2)
  return (
    <section
      aria-labelledby="discover-your-reading"
      className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]"
    >
      <div className="col-span-full flex items-baseline justify-between gap-4">
        <h2 id="discover-your-reading" className="font-serif text-[28px] font-medium">
          {t.heading(viewer.displayName)}
        </h2>
        <Link to={`/u/${viewer.username}/library`} className={actionLink}>
          {t.library}
        </Link>
      </div>
      {entries.map(({ book, shelf }) => (
        <div
          key={book.id}
          className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 rounded-[14px] border border-border bg-surface p-4"
        >
          <Cover
            cover={book.cover}
            title={book.title}
            authorName={authorsOf(book)[0]}
            slug={book.slug}
            size="small"
            className="w-full"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {shelf === 'reading' ? t.reading : t.wantToRead}
            </p>
            <Link
              to={`/books/${book.slug}`}
              className="font-serif text-[19px] leading-tight hover:underline"
            >
              {book.title}
            </Link>
            <p className="text-sm text-muted-foreground">{authorsOf(book).join(', ')}</p>
          </div>
        </div>
      ))}
      <div className="flex flex-col justify-center gap-2.5 rounded-[14px] border border-dashed border-[#a8a29e] px-5 py-4">
        <p className="font-semibold">{t.finishedPrompt}</p>
        <p className="text-sm text-muted-foreground">{t.finishedNote}</p>
        <Link to={`/u/${viewer.username}/library?shelf=read`} className={actionLink}>
          {t.writeReview}
        </Link>
      </div>
    </section>
  )
}

function MostReviewed({ books }: { books: MostReviewedItem[] }) {
  const t = text.thisMonth
  return (
    <Section id="discover-month" heading={t.mostReviewedHeading} note={t.mostReviewedNote}>
      <ol className="-mt-2 md:-mt-4">
        {books.slice(0, 5).map((book, i) => (
          <li
            key={book.id}
            className="grid grid-cols-[28px_44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 md:grid-cols-[44px_52px_minmax(0,1fr)_auto] md:gap-4 md:py-3.5"
          >
            <span
              aria-hidden="true"
              className="text-center font-serif text-[26px] font-medium text-[#64748b] md:text-[34px]"
            >
              {i + 1}
            </span>
            <Cover
              cover={book.cover}
              title={book.title}
              authorName={authorsOf(book)[0]}
              slug={book.slug}
              size="small"
              className="w-full"
            />
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                to={`/books/${book.slug}`}
                className="font-serif text-[17px] leading-tight hover:underline md:text-[19px]"
              >
                {book.title}
              </Link>
              <span className="text-[13px] text-muted-foreground md:text-sm">
                {authorsOf(book).join(', ')}
              </span>
            </div>
            <span className="flex flex-col items-end">
              <span className="sr-only">{t.newReviews(book.recentReviewCount)}</span>
              <span aria-hidden="true" className="text-sm font-semibold md:text-[15px]">
                {book.recentReviewCount}
              </span>
              <span aria-hidden="true" className="hidden text-xs text-muted-foreground md:block">
                {t.newReviewsLabel(book.recentReviewCount)}
              </span>
            </span>
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
      <ul className="flex flex-col gap-3 md:gap-4">
        {items.slice(0, 3).map(({ review, book }) => (
          <li key={`${book.id}-${review.id}`}>
            <ReviewExcerpt
              review={{
                rating: review.rating,
                headline: review.headline,
                excerpt: review.excerpt,
                authorName: review.author.displayName,
                authorUsername: review.author.username,
                approvedAt: review.approvedAt,
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

// Spine sizes for the sign-up pitch's shelf drawing, as whole classes (no inline styles, D-185).
const SPINES = [
  'w-[34px] h-[168px]',
  'w-[42px] h-[196px]',
  'w-[30px] h-[150px]',
  'w-[48px] h-[204px]',
  'w-[36px] h-[176px]',
  'w-[28px] h-[140px]',
  'w-[44px] h-[188px]',
  'w-[32px] h-[160px]',
  'w-[40px] h-[182px]',
  'w-[30px] h-[150px]',
] as const

function PitchIcon({ kind }: { kind: 'shelf' | 'star' | 'helpful' }) {
  const tone = {
    shelf: 'bg-[#eff6ff] text-accent',
    star: 'bg-[#fffbeb] text-warning',
    helpful: 'bg-[#ecfdf3] text-[#16a34a]',
  }[kind]
  return (
    <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
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
        {kind === 'shelf' ? <path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> : null}
        {kind === 'star' ? (
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        ) : null}
        {kind === 'helpful' ? (
          <>
            <path d="M7 10v12" />
            <path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H7V10l4-8a3 3 0 0 1 4 3.9z" />
          </>
        ) : null}
      </svg>
    </span>
  )
}

function SignUpPitch({ titles }: { titles: { slug: string; title: string }[] }) {
  const t = text.pitch
  const icons = ['shelf', 'star', 'helpful'] as const
  return (
    <section
      aria-labelledby="discover-pitch"
      className="grid items-center gap-10 overflow-hidden rounded-[20px] border border-border bg-surface p-6 md:rounded-3xl md:px-14 md:py-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-12"
    >
      <div className="flex flex-col gap-5 md:gap-6">
        <h2
          id="discover-pitch"
          className="font-serif text-[28px] leading-[1.1] font-medium tracking-[-0.01em] md:text-[40px]"
        >
          {t.heading}
        </h2>
        <p className="text-[15px] leading-relaxed text-[#334155] md:text-[17px]">{t.lead}</p>
        <ul className="flex flex-col gap-3.5">
          {t.items.map((item, i) => (
            <li key={item.lead} className="flex items-start gap-3.5">
              <PitchIcon kind={icons[i] ?? 'shelf'} />
              <span>
                <strong className="font-semibold">{item.lead}</strong>{' '}
                <span className="text-muted-foreground">{item.rest}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 font-semibold text-accent-foreground hover:bg-accent-hover md:h-11"
          >
            {t.create}
          </Link>
          <Link
            to="/login"
            className="inline-flex h-12 items-center justify-center rounded-full border border-input-border bg-surface px-6 font-semibold text-foreground hover:bg-surface-raised md:h-11"
          >
            {t.logIn}
          </Link>
        </div>
      </div>
      {titles.length > 0 ? (
        <div
          aria-hidden="true"
          className="hidden h-[220px] items-end gap-1.5 border-b-[6px] border-[#d9d4ca] px-5 lg:flex"
        >
          {titles.slice(0, SPINES.length).map((book, i) => (
            <span
              key={book.slug}
              className={`flex items-center justify-center overflow-hidden rounded-t-[2px] shadow-[inset_-3px_0_0_rgba(0,0,0,0.2)] ${SPINES[i]} ${generatedCoverClass(book.slug)}`}
            >
              <span className="max-h-[88%] rotate-180 overflow-hidden font-serif text-[13px] whitespace-nowrap text-[#fdfaf3] [writing-mode:vertical-rl]">
                {book.title}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function HowItWorks() {
  const t = text.howItWorks
  return (
    <Section id="discover-how" heading={t.heading}>
      <ol className="grid gap-6 md:grid-cols-3">
        {t.steps.map((step) => (
          <li key={step.title} className="flex flex-col gap-2.5 border-t-2 border-accent pt-5">
            <h3 className="font-serif text-xl font-medium">{step.title}</h3>
            <p className="text-[15px] leading-[1.55] text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
      <Link to="/community-guidelines" className="text-[15px] text-link underline">
        {t.guidelines}
      </Link>
    </Section>
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
  const spineBooks = [...(discover.topRated ?? []), ...(discover.recentlyReviewed ?? [])].filter(
    (book, i, all) => all.findIndex((other) => other.id === book.id) === i,
  )
  return (
    <div className="flex flex-col gap-14 md:gap-20">
      <Hero discover={discover} />
      {hasContent ? null : <p className="text-muted-foreground">{text.empty}</p>}
      {viewer && reading && showReading ? (
        <YourReadingStrip viewer={viewer} reading={reading} />
      ) : null}
      {discover.featuredGenres ? (
        <Section
          id="discover-genres"
          heading={text.browseByGenre}
          note={text.genresNote}
          action={
            <Link to="/genres" className={actionLink}>
              {text.allGenres}
              <ArrowRight />
            </Link>
          }
        >
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
            {discover.featuredGenres.slice(0, 12).map((genre) => (
              <li key={genre.slug}>
                <GenreTile
                  name={genre.name}
                  slug={genre.slug}
                  href={`/genres/${genre.slug}`}
                  books={[]}
                />
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
      {discover.mostReviewedThisMonth || discover.justApproved ? (
        <section
          aria-label={text.thisMonth.label}
          className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
        >
          {discover.mostReviewedThisMonth ? (
            <MostReviewed books={discover.mostReviewedThisMonth} />
          ) : null}
          {discover.justApproved ? <JustApproved items={discover.justApproved} /> : null}
        </section>
      ) : null}
      {discover.recentlyReviewed ? (
        <Section id="discover-recent" heading={text.recentlyReviewed}>
          <BookRail
            label={text.recentlyReviewed}
            items={railItems(discover.recentlyReviewed.slice(0, 7), signedIn)}
          />
        </Section>
      ) : null}
      {signedIn ? null : <SignUpPitch titles={spineBooks} />}
      <HowItWorks />
    </div>
  )
}
