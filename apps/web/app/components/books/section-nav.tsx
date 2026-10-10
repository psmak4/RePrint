import { cn } from '@reprint/ui'
import { useEffect, useState } from 'react'
import { copy } from '../../copy/index.js'

export type SectionNavItem = { id: string; label: string; count?: number }

/**
 * Sticky in-page navigation. Each item jumps to the section with that id and the one in view is
 * marked `aria-current`. Callers leave out items for empty sections. The bar's background and
 * bottom rule reach the viewport edges with box-shadows, so the page never scrolls sideways.
 */
export function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id)

  // Follow the reader: the last section whose top has passed the upper part of the viewport.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null)
    if (sections.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = items.find((item) => visible.has(item.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: '-96px 0px -60% 0px' },
    )
    for (const el of sections) observer.observe(el)
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null
  return (
    <nav
      aria-label={copy.redesign.sectionNav.label}
      className="sticky top-0 z-20 bg-[rgba(251,250,247,0.96)] shadow-[0_0_0_100vmax_rgba(251,250,247,0.96),0_1px_0_100vmax_var(--color-border)] backdrop-blur-sm [clip-path:inset(0_-100vmax_-1px)]"
    >
      <ul className="flex gap-6 overflow-x-auto [scrollbar-width:none] md:gap-7">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => setCurrent(item.id)}
                className={cn(
                  'inline-flex h-[52px] items-center gap-1.5 border-b-2 px-1 text-[15px] font-medium whitespace-nowrap md:h-14',
                  active
                    ? 'border-accent text-foreground'
                    : 'border-transparent text-[#334155] hover:text-foreground',
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span className="rounded-full bg-[#ece8e0] px-[7px] py-0.5 text-xs font-semibold text-[#334155]">
                    {item.count}
                  </span>
                ) : null}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
