import { type KeyboardEvent, useId, useRef } from 'react'
import { copy } from '../../copy/index.js'

const STARS = [1, 2, 3, 4, 5]

type StarRatingInputProps = {
  value: number | null
  onChange: (value: number) => void
  /** Id of the element that labels the group; falls back to the default "Your rating" label. */
  labelledBy?: string
  describedBy?: string
  invalid?: boolean
  disabled?: boolean
}

/**
 * A 1 to 5 whole-star radio group of native radios. One star is tabbable (the selected one, or the first);
 * arrow keys move and select, Home and End jump to the ends, like a native radio group.
 */
export function StarRatingInput({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  disabled,
}: StarRatingInputProps) {
  const name = useId()
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function select(next: number) {
    onChange(next)
    refs.current[next - 1]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, current: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        event.preventDefault()
        select(current === 5 ? 1 : current + 1)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        event.preventDefault()
        select(current === 1 ? 5 : current - 1)
        break
      case 'Home':
        event.preventDefault()
        select(1)
        break
      case 'End':
        event.preventDefault()
        select(5)
        break
    }
  }

  const tabbable = value ?? 1
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : copy.reviews.starRating.groupLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="flex gap-1"
    >
      {STARS.map((n) => (
        <label
          key={n}
          className={`relative cursor-pointer text-3xl leading-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
            value !== null && n <= value ? 'text-warning' : 'text-input-border'
          }`}
        >
          <input
            ref={(el) => {
              refs.current[n - 1] = el
            }}
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            aria-label={copy.reviews.starRating.starLabel(n)}
            tabIndex={n === tabbable ? 0 : -1}
            disabled={disabled}
            onChange={() => onChange(n)}
            onKeyDown={(event) => onKeyDown(event, n)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span aria-hidden="true">★</span>
        </label>
      ))}
    </div>
  )
}
