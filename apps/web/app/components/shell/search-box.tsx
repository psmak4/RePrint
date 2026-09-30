import { SEARCH_MIN_LENGTH, SEARCH_QUERY_MAX_LENGTH } from '@reprint/shared'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { copy } from '../../copy/index.js'
import { fetchSuggestions, type Option, type Suggest, toOptions } from '../../lib/search-suggest.js'

/** Wait this long after the last keystroke before asking for suggestions (PRD §7.3). */
export const SUGGEST_DELAY_MS = 250

function renderOption(option: Option, id: string, selected: boolean, choose: () => void) {
  return (
    // Keyboard use goes through the combobox input (arrows and Enter), per the ARIA pattern.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the input owns keyboard handling
    <div
      key={option.key}
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      // Keep focus in the input while the pointer picks an option.
      onMouseDown={(event) => event.preventDefault()}
      onClick={choose}
      className="flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-surface-raised hover:bg-surface-raised"
    >
      <span>
        <span className="font-medium">{option.label}</span>
        {option.detail ? (
          <span className="text-muted-foreground">{` · ${option.detail}`}</span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">{option.kind}</span>
    </div>
  )
}

/**
 * The header search box (PRD §7.3): an ARIA combobox that suggests Books and Authors from the
 * Catalog after 2 characters. Without JavaScript the form still submits to `/search`.
 */
export function SearchBox({ suggest = fetchSuggestions }: { suggest?: Suggest }) {
  const c = copy.shell.search
  const navigate = useNavigate()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<Option[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const trimmed = query.trim()

  useEffect(() => {
    setActive(-1)
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setOptions([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      suggest(trimmed, controller.signal)
        .then((result) => {
          setOptions(toOptions(result))
          setOpen(true)
        })
        // Suggestions are a convenience: a failure just leaves the box as a plain search field.
        .catch(() => setOptions([]))
    }, SUGGEST_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, suggest])

  const expanded = open && options.length > 0
  const optionId = (index: number) => `${listId}-option-${index}`

  function go(href: string) {
    setOpen(false)
    navigate(href)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Position 0 is the input itself (no option active), so the ring has one extra stop.
      setActive((current) => ((current + 1 + step + options.length + 1) % (options.length + 1)) - 1)
    } else if (event.key === 'Escape') {
      if (expanded) event.preventDefault()
      setOpen(false)
      setActive(-1)
    } else if (event.key === 'Enter') {
      const chosen = expanded ? options[active] : undefined
      if (chosen) {
        event.preventDefault()
        go(chosen.href)
      } else if (trimmed.length === 0) {
        event.preventDefault()
      }
    }
  }

  return (
    <form
      action="/search"
      method="get"
      className="relative flex gap-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <input
        type="text"
        name="q"
        role="combobox"
        aria-label={c.inputLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        placeholder={c.placeholder}
        autoComplete="off"
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-md border border-input-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-10"
      />
      <button
        type="submit"
        className="h-11 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:h-10"
      >
        {c.submit}
      </button>
      <div
        id={listId}
        role="listbox"
        aria-label={c.suggestionsLabel}
        hidden={!expanded}
        className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-auto rounded-md border border-border bg-surface p-1"
      >
        {options.map((option, index) =>
          renderOption(option, optionId(index), index === active, () => go(option.href)),
        )}
      </div>
      <div role="status" className="sr-only">
        {expanded ? c.resultCount(options.length) : ''}
      </div>
    </form>
  )
}
