import type { Cover as CoverData } from '@reprint/shared'
import { cn } from '@reprint/ui'
import { useEffect, useRef, useState } from 'react'
import { copy } from '../../copy/index.js'
import { generatedCoverClass } from '../../lib/cover-color.js'
import { type CoverSize, coverUrl } from '../../lib/cover-url.js'

/** A bound book's spine edge and soft drop shadow (docs/DESIGN.md, Generated covers). */
export const COVER_SHADOW =
  'shadow-[inset_4px_0_0_rgba(0,0,0,0.22),0_12px_24px_-10px_rgba(15,23,42,0.45)]'

const WIDTHS: Record<CoverSize, string> = {
  small: 'w-16',
  medium: 'w-28',
  large: 'w-40 md:w-56',
}

/**
 * A Book's Cover at 2:3, with space reserved so nothing shifts. When the image is missing or
 * fails to load, a generated cover shows the title and author instead (PRD §6).
 */
export function Cover({
  cover,
  title,
  authorName,
  slug,
  dashed = false,
  size = 'medium',
  className,
}: {
  cover: CoverData | null
  title: string
  authorName?: string | null
  /** Picks the generated cover's colour; falls back to the title when a page has no slug. */
  slug?: string | null
  /** A dashed frame for a Book that is not on RePrint yet (search candidates). */
  dashed?: boolean
  size?: CoverSize
  className?: string
}) {
  const url = coverUrl(cover, size)
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // An image that failed before hydration never fires `onError` in React, so check it once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  const frame = cn(
    'relative aspect-[2/3] shrink-0 overflow-hidden rounded-[3px_6px_6px_3px] bg-surface-raised',
    COVER_SHADOW,
    WIDTHS[size],
    className,
  )

  if (!url || failed) {
    return (
      <GeneratedCover
        title={title}
        authorName={authorName}
        slug={slug ?? title}
        dashed={dashed}
        className={cn(WIDTHS[size], className)}
      />
    )
  }

  return (
    <div className={frame}>
      <img
        ref={imgRef}
        src={url}
        alt={copy.books.coverAlt(title)}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

/**
 * The designed cover for a Book with no image: a solid colour from the slug, an inset frame, the
 * author at the top, the title in the serif, and a short rule. Type scales with the cover's own
 * width (container query units), so one component serves a 44 px thumbnail and a 300 px header.
 */
export function GeneratedCover({
  title,
  authorName,
  slug,
  dashed = false,
  className,
}: {
  title: string
  authorName?: string | null | undefined
  slug: string
  dashed?: boolean
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={copy.books.coverAlt(title)}
      data-generated-cover=""
      className={cn(
        '@container relative aspect-[2/3] shrink-0 overflow-hidden rounded-[3px_6px_6px_3px] text-[#fdfaf3]',
        dashed
          ? 'border border-dashed border-[#a8a29e] bg-surface-raised text-[#334155]'
          : [generatedCoverClass(slug), COVER_SHADOW],
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-[6cqw] flex flex-col items-center justify-between border px-[7cqw] pt-[10cqw] pb-[9cqw] text-center',
          dashed ? 'border-[#a8a29e]' : 'border-[rgba(253,250,243,0.32)]',
        )}
      >
        <span className="line-clamp-2 w-full text-[6.4cqw] leading-[1.3] tracking-[0.14em] break-words uppercase opacity-[0.88]">
          {authorName ?? ''}
        </span>
        <span className="line-clamp-5 w-full font-serif text-[13cqw] leading-[1.05] font-medium tracking-[-0.01em] break-words hyphens-auto">
          {title}
        </span>
        <span className="block w-[20cqw] border-t border-current opacity-55" />
      </div>
    </div>
  )
}
