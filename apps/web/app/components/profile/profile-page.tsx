import type { Profile, ProfileReview, Viewer } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { BookCard } from '../books/book-card.js'
import { summaryCard } from '../books/genre-pages.js'
import { ReviewBody } from '../reviews/reviews-list.js'
import { SpoilerToggle } from '../reviews/spoiler-toggle.js'

const text = copy.profile

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export type ProfileReviewsView = { page: number; totalPages: number }

function Avatar({ profile }: { profile: Profile }) {
  const frame =
    'flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised md:size-32'
  if (!profile.avatarUrl) {
    return (
      <div role="img" aria-label={text.avatarAlt(profile.displayName)} className={frame}>
        <span aria-hidden="true" className="text-4xl font-semibold text-muted-foreground">
          {Array.from(profile.displayName)[0]?.toUpperCase()}
        </span>
      </div>
    )
  }
  return (
    <div className={frame}>
      <img
        src={profile.avatarUrl}
        alt={text.avatarAlt(profile.displayName)}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  )
}

function ReviewItem({ review }: { review: ProfileReview }) {
  const body = <ReviewBody body={review.body} />
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <BookCard book={summaryCard(review.book)} href={`/books/${review.book.slug}`} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span role="img" aria-label={text.ratingOf(review.rating)} className="text-warning">
          {'★'.repeat(review.rating)}
          <span className="text-input-border">{'★'.repeat(5 - review.rating)}</span>
        </span>
        {review.headline ? <h3 className="font-semibold">{review.headline}</h3> : null}
        <time dateTime={review.submittedAt} className="text-sm text-muted-foreground">
          {dateFormat.format(new Date(review.submittedAt))}
        </time>
      </div>
      {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
    </li>
  )
}

function Pagination({ username, view }: { username: string; view: ProfileReviewsView }) {
  if (view.totalPages <= 1) return null
  const href = (page: number) => (page > 1 ? `/u/${username}?page=${page}` : `/u/${username}`)
  return (
    <nav aria-label={text.pagesLabel} className="flex items-center justify-between">
      {view.page > 1 ? (
        <Link rel="prev" to={href(view.page - 1)} className="text-link underline">
          {text.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        {text.pageOf(view.page, view.totalPages)}
      </span>
      {view.page < view.totalPages ? (
        <Link rel="next" to={href(view.page + 1)} className="text-link underline">
          {text.next}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

/** `/u/:username`: header, totals, and tabs for Reviews and Library (PRD §7.8). */
export function ProfilePage({
  profile,
  reviews,
  view,
  viewer = null,
}: {
  profile: Profile
  reviews: ProfileReview[]
  view: ProfileReviewsView
  viewer?: Viewer | null
}) {
  const isOwner = viewer?.username.toLowerCase() === profile.username.toLowerCase()
  const showLibrary = profile.libraryPublic || isOwner
  const tabClass = 'px-3 py-2'
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar profile={profile} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl font-semibold break-words">{profile.displayName}</h1>
          <p className="text-muted-foreground">{text.handle(profile.username)}</p>
          <p className="text-sm text-muted-foreground">
            {text.joined(monthFormat.format(new Date(profile.joinedAt)))}
          </p>
          {profile.bio ? (
            <p className="mt-2 whitespace-pre-line break-words">{profile.bio}</p>
          ) : null}
        </div>
      </header>
      <section aria-label={text.totalsLabel}>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <li>{text.reviewsTotal(profile.reviewCount)}</li>
          <li>{text.helpfulTotal(profile.helpfulVotes)}</li>
        </ul>
      </section>
      <nav aria-label={text.tabsLabel} className="flex flex-wrap gap-2 border-b border-border">
        <span aria-current="page" className={`${tabClass} border-b-2 border-primary font-semibold`}>
          {text.reviewsTab}
        </span>
        {showLibrary ? (
          <Link
            to={`/u/${profile.username}/library`}
            className={`${tabClass} text-muted-foreground hover:text-foreground`}
          >
            {text.libraryTab}
          </Link>
        ) : null}
      </nav>
      <h2 className="sr-only">{text.reviewsTab}</h2>
      {reviews.length === 0 ? (
        <p className="text-muted-foreground">{text.noReviews}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </ul>
      )}
      <Pagination username={profile.username} view={view} />
    </div>
  )
}
