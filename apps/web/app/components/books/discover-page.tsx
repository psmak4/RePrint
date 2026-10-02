import type { BookSummary, DiscoverResponse, Viewer } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { SpoilerToggle } from '../reviews/spoiler-toggle.js'
import { BookCard } from './book-card.js'
import { summaryCard } from './genre-pages.js'
import { BookShelfSelector } from './shelf-selector.js'

const text = copy.home

function BookRow({
  id,
  heading,
  books,
  signedIn,
}: {
  id: string
  heading: string
  books: BookSummary[]
  signedIn: boolean
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-2xl font-semibold">
        {heading}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {books.map((book) => (
          <li key={book.id}>
            <BookCard
              book={summaryCard(book)}
              href={`/books/${book.slug}`}
              shelf={<BookShelfSelector book={book} signedIn={signedIn} />}
            />
          </li>
        ))}
      </ul>
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
    <section aria-labelledby="discover-featured-review" className="flex flex-col gap-3">
      <h2 id="discover-featured-review" className="text-2xl font-semibold">
        {text.featuredReview}
      </h2>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">
          {text.featuredReviewOn}{' '}
          <Link to={`/books/${book.slug}`} className="text-link underline">
            {book.title}
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            role="img"
            aria-label={copy.reviews.list.ratingOf(review.rating)}
            className="text-warning"
          >
            {'★'.repeat(review.rating)}
            <span className="text-input-border">{'★'.repeat(5 - review.rating)}</span>
          </span>
          {review.headline ? <h3 className="font-semibold">{review.headline}</h3> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <Link to={`/u/${review.author.username}`} className="text-link underline">
            {copy.reviews.list.by(review.author.displayName)}
          </Link>
        </p>
        {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
        <Link to={`/books/${book.slug}#reviews`} className="text-link underline">
          {text.readMore}
        </Link>
      </div>
    </section>
  )
}

/** `/`: the Discover rows. A hidden row is `null` and leaves no heading or gap (PRD §7.2). */
export function DiscoverPage({
  discover,
  viewer,
}: {
  discover: DiscoverResponse
  viewer: Viewer | null
}) {
  const hasContent = Object.values(discover).some((row) => row !== null)
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold">{text.title}</h1>
        <p className="text-lg text-muted-foreground">{text.lead}</p>
        {viewer ? null : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">{text.signInPrompt}</p>
            <Link to="/login" className="text-link underline">
              {text.signIn}
            </Link>
            <Link to="/register" className="text-link underline">
              {text.register}
            </Link>
          </div>
        )}
      </header>
      {hasContent ? null : <p className="text-muted-foreground">{text.empty}</p>}
      {discover.recentlyReviewed ? (
        <BookRow
          id="discover-recent"
          signedIn={viewer !== null}
          heading={text.recentlyReviewed}
          books={discover.recentlyReviewed}
        />
      ) : null}
      {discover.topRated ? (
        <BookRow
          id="discover-top"
          signedIn={viewer !== null}
          heading={text.topRated}
          books={discover.topRated}
        />
      ) : null}
      {discover.mostReviewedThisMonth ? (
        <BookRow
          id="discover-month"
          signedIn={viewer !== null}
          heading={text.mostReviewedThisMonth}
          books={discover.mostReviewedThisMonth}
        />
      ) : null}
      {discover.featuredGenres ? (
        <section aria-labelledby="discover-genres" className="flex flex-col gap-3">
          <h2 id="discover-genres" className="text-2xl font-semibold">
            {text.browseByGenre}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {discover.featuredGenres.map((genre) => (
              <li key={genre.slug}>
                <Link
                  to={`/genres/${genre.slug}`}
                  className="inline-block rounded-md border border-border bg-surface px-4 py-2 text-link hover:underline"
                >
                  {genre.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/genres" className="text-link underline">
            {text.allGenres}
          </Link>
        </section>
      ) : null}
      {discover.featuredReview ? <FeaturedReview featured={discover.featuredReview} /> : null}
    </div>
  )
}
