import { cn } from '@reprint/ui'
import { copy } from '../../copy/index.js'
import { widthClass } from '../../lib/width-class.js'

const STARS = '★★★★★'

/**
 * Five stars with partial fill for an average (4.3 fills the fifth star by 30%). The stars are one
 * image named "Rated X out of 5"; callers show the number and review count beside it. `w-max`
 * keeps the box as wide as the five stars even as a stretched flex item, because the fill is a
 * percentage of this box (D-186).
 */
export function StarRating({
  average,
  className,
}: {
  /** 0 to 5; values outside that range are clamped. */
  average: number
  className?: string
}) {
  const clamped = Math.min(5, Math.max(0, average))
  return (
    <span
      role="img"
      aria-label={copy.redesign.starRating(clamped.toFixed(1))}
      className={cn('relative inline-block w-max text-base leading-none tracking-wider', className)}
    >
      <span aria-hidden="true" className="text-[#d6d3d1]">
        {STARS}
      </span>
      <span
        aria-hidden="true"
        data-testid="star-fill"
        className={cn(
          'absolute top-0 left-0 overflow-hidden whitespace-nowrap text-star',
          widthClass(clamped / 5),
        )}
      >
        {STARS}
      </span>
    </span>
  )
}
