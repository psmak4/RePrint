import type { RatingSummary as Summary } from '@reprint/shared'
import { Link } from 'react-router'
import { copy } from '../../copy/index.js'
import { type ReviewListQuery, reviewsHref } from '../../lib/review-links.js'

const text = copy.reviews.list

/**
 * Average, count, and a 5-bar distribution (5 stars first). Each bar links to the review list
 * filtered to that rating; the chart is decorative-plus-links, with a text alternative for the numbers.
 */
export function RatingSummary({
  slug,
  rating,
  query,
}: {
  slug: string
  rating: Summary
  query: ReviewListQuery
}) {
  if (rating.average === null || rating.count === 0) return null
  const max = Math.max(...rating.distribution, 1)
  const rows = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: rating.distribution[stars - 1] ?? 0,
  }))
  return (
    <section aria-labelledby="rating-summary" className="flex flex-col gap-3">
      <h2 id="rating-summary" className="sr-only">
        {text.summaryHeading}
      </h2>
      <p className="flex items-baseline gap-3">
        <span className="text-4xl font-semibold">{rating.average.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">{text.count(rating.count)}</span>
      </p>
      <p className="sr-only">
        {text.average(rating.average.toFixed(1))}.{' '}
        {text.distributionText(rows.map((row) => row.count))}
      </p>
      <ul aria-label={text.distributionLabel} className="flex flex-col gap-1">
        {rows.map(({ stars, count }) => {
          const active = query.rating === stars
          return (
            <li key={stars}>
              <Link
                to={reviewsHref(slug, query, { rating: active ? undefined : stars, page: 1 })}
                aria-label={text.barLabel(stars, count, active)}
                aria-current={active ? 'true' : undefined}
                className="flex items-center gap-2 rounded px-1 text-sm hover:bg-surface"
              >
                <span aria-hidden="true" className="w-8 shrink-0">
                  {stars} ★
                </span>
                <span aria-hidden="true" className="h-3 flex-1 rounded bg-input-border/40">
                  <span
                    className={`block h-3 rounded ${active ? 'bg-link' : 'bg-warning'}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span aria-hidden="true" className="w-8 shrink-0 text-right text-muted-foreground">
                  {count}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
