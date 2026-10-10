import { copy } from '../../copy/index.js'
import { widthClass } from '../../lib/width-class.js'
import { StarRating } from './star-rating.js'

const text = copy.redesign.ratingBreakdown

/**
 * The average, the count, and a bar per star level. Each bar is a toggle button: pressing it asks
 * the caller to filter reviews to that rating, and pressing it again clears the filter.
 */
export function RatingBreakdown({
  average,
  count,
  distribution,
  selected,
  onSelect,
}: {
  average: number
  count: number
  /** Review counts for 1 to 5 stars, in that order. */
  distribution: number[]
  /** The star level currently filtered to, if any. */
  selected: number | null
  onSelect: (stars: number | null) => void
}) {
  const max = Math.max(...distribution, 1)
  return (
    <section aria-label={text.heading} className="flex flex-col gap-4 sm:flex-row sm:gap-8">
      <div className="flex flex-col gap-1">
        <p className="font-serif text-5xl leading-none font-medium">{average.toFixed(1)}</p>
        <StarRating average={average} />
        <p className="text-sm text-muted-foreground">{text.count(count)}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-1">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = distribution[stars - 1] ?? 0
          const active = selected === stars
          return (
            <li key={stars}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={text.barLabel(stars, n)}
                onClick={() => onSelect(active ? null : stars)}
                className="flex min-h-6 w-full items-center gap-2 rounded px-1 text-sm hover:bg-surface-raised"
              >
                <span aria-hidden="true" className="w-8 shrink-0 text-left">
                  {stars} ★
                </span>
                <span aria-hidden="true" className="h-2.5 flex-1 rounded-full bg-[#ece8e0]">
                  <span
                    className={`block h-2.5 rounded-full ${active ? 'bg-accent' : 'bg-star'} ${widthClass(n / max)}`}
                  />
                </span>
                <span aria-hidden="true" className="w-8 shrink-0 text-right text-muted-foreground">
                  {n}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
