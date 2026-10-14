import type { OutsideRating } from '@reprint/shared'
import { useId, useState } from 'react'
import { copy } from '../../copy/index.js'
import { widthClass } from '../../lib/width-class.js'

const text = copy.redesign.outsideRatings

function OutsideRatingLine({ rating }: { rating: OutsideRating }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const average = rating.average.toFixed(1)
  const max = Math.max(...rating.distribution, 1)
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-foreground">{text.label(rating.sourceName)}</span>
        <span aria-hidden="true">·</span>
        <span>
          <span aria-hidden="true">
            <span className="text-star">★</span> {average}
          </span>
          <span className="sr-only">{text.average(average)}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span>{text.count(rating.count)}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="font-semibold text-link underline underline-offset-[3px]"
        >
          {open ? text.hide : text.show}
        </button>
      </p>
      <ul
        id={listId}
        hidden={!open}
        aria-label={text.breakdown(rating.sourceName)}
        className="flex max-w-sm flex-col gap-1"
      >
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = rating.distribution[stars - 1] ?? 0
          return (
            <li
              key={stars}
              className="grid grid-cols-[36px_minmax(0,1fr)_48px] items-center gap-2.5 text-sm"
            >
              <span aria-hidden="true">{stars} ★</span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#ece8e0]">
                <span className={`block h-full rounded-full bg-star ${widthClass(n / max)}`} />
              </span>
              <span aria-hidden="true" className="text-right">
                {n.toLocaleString('en-US')}
              </span>
              <span className="sr-only">{text.bar(stars, n)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Other Sources' reader ratings (D-204), in their own muted panel under RePrint's summary: labeled
 * with the Source, never mixed into RePrint's numbers, and no link to the Source.
 */
export function OutsideRatings({ ratings }: { ratings: OutsideRating[] }) {
  if (ratings.length === 0) return null
  return (
    <section
      aria-label={text.heading}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-[18px] text-[15px] text-muted-foreground md:px-7"
    >
      {ratings.map((rating) => (
        <OutsideRatingLine key={rating.sourceName} rating={rating} />
      ))}
    </section>
  )
}
