import { cn } from '@reprint/ui'
import { type ReactNode, type SyntheticEvent, useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/** A row in a menu panel: a link or a button, 44 px tall (D-214). */
export const menuItemClass =
  'flex h-11 w-full items-center rounded-lg px-3 text-left text-[15px] font-medium text-strong hover:bg-surface-raised hover:text-foreground aria-[current=page]:bg-surface-raised aria-[current=page]:text-foreground'

/** The panel a menu opens: a white card under its button, on the right. */
const panelClass =
  'absolute right-0 z-40 mt-2 flex min-w-52 flex-col rounded-2xl border border-border bg-surface p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.3)]'

/**
 * The one menu (D-214): a native `<details>`, so it opens without JavaScript. With JavaScript it
 * closes when the page changes, on Escape (focus returns to its button), on a click or tap outside,
 * and when another menu opens. The phone menu, the account menu, and notifications use it.
 */
export function Menu({
  className,
  label,
  button,
  buttonClassName,
  panelClassName,
  onOpen,
  children,
}: {
  /** Classes for the menu's place in its row, such as `md:hidden`. */
  className?: string
  /** The button's accessible name, such as "Account menu". */
  label: string
  /** What the button shows: a name, an icon, or both. */
  button: ReactNode
  buttonClassName: string
  panelClassName?: string
  onOpen?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const { pathname, search } = useLocation()
  const where = `${pathname}${search}`
  const shownAt = useRef(where)

  // A followed link (or any navigation) closes it.
  useEffect(() => {
    if (shownAt.current === where) return
    shownAt.current = where
    if (ref.current) ref.current.open = false
  }, [where])

  useEffect(() => {
    const details = ref.current
    if (!details) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !details?.open) return
      details.open = false
      details.querySelector('summary')?.focus()
    }
    function onPointerDown(event: PointerEvent) {
      if (details?.open && !details.contains(event.target as Node)) details.open = false
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const details = event.currentTarget
    if (!details.open) return
    // One menu at a time.
    for (const other of document.querySelectorAll<HTMLDetailsElement>('details[data-menu]')) {
      if (other !== details) other.open = false
    }
    onOpen?.()
  }

  return (
    <details ref={ref} data-menu="" className={cn('relative', className)} onToggle={onToggle}>
      <summary aria-label={label} className={cn('cursor-pointer list-none', buttonClassName)}>
        {button}
      </summary>
      <div className={cn(panelClass, panelClassName)}>{children}</div>
    </details>
  )
}
