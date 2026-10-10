import type { Profile, ProfileReview, Viewer } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { avatarClass, initialsOf } from '../../lib/avatar.js'
import { Cover } from '../books/cover.js'
import { summaryCard } from '../books/genre-pages.js'
import { PageHero, PagerLinks } from '../books/page-hero.js'
import { StarRating } from '../books/star-rating.js'
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
    'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full md:size-28'
  if (!profile.avatarUrl) {
    return (
      <div
        role="img"
        aria-label={text.avatarAlt(profile.displayName)}
        className={`${frame} ${avatarClass(profile.username)}`}
      >
        <span aria-hidden="true" className="font-serif text-3xl font-medium md:text-[40px]">
          {initialsOf(profile.displayName)}
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
  const card = summaryCard(review.book)
  const href = `/books/${review.book.slug}`
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 border-b border-border py-6 md:grid-cols-[88px_minmax(0,1fr)] md:gap-6 md:py-7">
      <Link to={href} tabIndex={-1} aria-hidden="true" className="self-start">
        <Cover
          cover={card.cover}
          title={card.title}
          authorName={card.authorNames[0]}
          slug={review.book.slug}
          size="small"
          className="w-full"
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-2.5">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={href} className="text-[15px] font-semibold hover:underline md:text-base">
            {card.title}
          </Link>
          {card.authorNames.length > 0 ? (
            <span className="text-sm text-muted-foreground">{card.authorNames.join(', ')}</span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span role="img" aria-label={text.ratingOf(review.rating)} className="w-max">
            <StarRating average={review.rating} className="text-base" />
          </span>
          <time dateTime={review.submittedAt} className="text-[13px] text-muted-foreground">
            {dateFormat.format(new Date(review.submittedAt))}
          </time>
        </div>
        {review.headline ? (
          <h3 className="font-serif text-[21px] leading-tight font-medium md:text-2xl">
            {review.headline}
          </h3>
        ) : null}
        <div className="text-[15px] leading-[1.65] text-[#1e293b] md:text-base md:leading-[1.7]">
          {review.hasSpoilers ? <SpoilerToggle>{body}</SpoilerToggle> : body}
        </div>
      </div>
    </li>
  )
}

function Pagination({ username, view }: { username: string; view: ProfileReviewsView }) {
  if (view.totalPages <= 1) return null
  const href = (page: number) => (page > 1 ? `/u/${username}?page=${page}` : `/u/${username}`)
  return (
    <PagerLinks
      label={text.pagesLabel}
      previous={view.page > 1 ? { href: href(view.page - 1), text: text.previous } : null}
      next={view.page < view.totalPages ? { href: href(view.page + 1), text: text.next } : null}
      status={text.pageOf(view.page, view.totalPages)}
    />
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
  const tab =
    'inline-flex h-[52px] items-center border-b-2 text-base font-medium -mb-px whitespace-nowrap'
  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHero
        leading={<Avatar profile={profile} />}
        title={profile.displayName}
        lead={
          <>
            {text.handle(profile.username)}
            <span aria-hidden="true" className="text-muted-foreground">
              {' · '}
            </span>
            <span className="text-muted-foreground">
              {text.joined(monthFormat.format(new Date(profile.joinedAt)))}
            </span>
          </>
        }
      >
        {profile.bio ? (
          <p className="max-w-[640px] text-[15px] leading-relaxed whitespace-pre-line break-words text-[#334155] md:text-base">
            {profile.bio}
          </p>
        ) : null}
        <section aria-label={text.totalsLabel}>
          <ul className="flex flex-wrap gap-2">
            <li className="inline-flex h-[34px] items-center rounded-full border border-[#d9d4ca] bg-surface px-3.5 text-sm font-medium">
              {text.reviewsTotal(profile.reviewCount)}
            </li>
            <li className="inline-flex h-[34px] items-center rounded-full border border-[#d9d4ca] bg-surface px-3.5 text-sm font-medium">
              {text.helpfulTotal(profile.helpfulVotes)}
            </li>
          </ul>
        </section>
      </PageHero>
      <div className="flex flex-col">
        <nav aria-label={text.tabsLabel} className="flex gap-7 border-b border-border">
          <span aria-current="page" className={`${tab} border-accent text-foreground`}>
            {text.reviewsTab}
          </span>
          {showLibrary ? (
            <Link
              to={`/u/${profile.username}/library`}
              className={`${tab} border-transparent text-[#334155] hover:text-foreground`}
            >
              {text.libraryTab}
            </Link>
          ) : null}
        </nav>
        <h2 className="sr-only">{text.reviewsTab}</h2>
        {reviews.length === 0 ? (
          <p className="py-8 text-muted-foreground">{text.noReviews}</p>
        ) : (
          <ul className="flex flex-col">
            {reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
        )}
      </div>
      <Pagination username={profile.username} view={view} />
    </div>
  )
}
