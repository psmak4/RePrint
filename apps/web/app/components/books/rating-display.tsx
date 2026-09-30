import { copy } from '../../copy/index.js'

const STARS = [1, 2, 3, 4, 5]

/**
 * A Book's RePrint average and review count, or "No RePrint reviews yet" before the first Review.
 * The stars are decorative; the text label carries the meaning.
 */
export function RatingDisplay({ rating }: { rating: { average: number | null; count: number } }) {
  if (rating.average === null || rating.count === 0) {
    return <p className="text-sm text-muted-foreground">{copy.books.noReviews}</p>
  }
  const average = rating.average.toFixed(1)
  return (
    <p className="flex items-center gap-2 text-sm">
      <span aria-hidden="true" className="flex gap-0.5" data-testid="rating-stars">
        {STARS.map((n) => (
          <span
            key={n}
            className={n <= Math.round(rating.average ?? 0) ? 'text-warning' : 'text-input-border'}
          >
            ★
          </span>
        ))}
      </span>
      <span className="sr-only">{copy.books.ratingLabel(average, rating.count)}</span>
      <span aria-hidden="true">
        <span className="font-semibold">{average}</span>{' '}
        <span className="text-muted-foreground">{copy.books.reviewCount(rating.count)}</span>
      </span>
    </p>
  )
}
