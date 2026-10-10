import { SEARCH_MIN_LENGTH, SEARCH_QUERY_MAX_LENGTH } from '@reprint/shared'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
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
      className="flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-sm aria-selected:bg-surface-raised hover:bg-surface-raised"
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
  const location = useLocation()
  const listId = useId()
  // On the results page the box shows the current query, so the page needs no second search field.
  const current =
    location.pathname === '/search' ? (new URLSearchParams(location.search).get('q') ?? '') : ''
  const [query, setQuery] = useState(current)
  useEffect(() => {
    setQuery(current)
  }, [current])
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
      className="relative flex h-11 items-center gap-1 rounded-full border border-input-border bg-surface pr-4 pl-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="submit"
        aria-label={c.submit}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-raised hover:text-foreground"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
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
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div
        id={listId}
        role="listbox"
        aria-label={c.suggestionsLabel}
        hidden={!expanded}
        className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.3)]"
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
