import type { Cover as CoverData } from '@reprint/shared'
import { cn } from '@reprint/ui'
import { useEffect, useRef, useState } from 'react'
import { copy } from '../../copy/index.js'
import { generatedCoverClass } from '../../lib/cover-color.js'
import { type CoverSize, coverSrcSet, coverUrl } from '../../lib/cover-url.js'

/** A bound book's spine edge and soft drop shadow (docs/DESIGN.md, Generated covers). */
export const COVER_SHADOW =
  'shadow-[inset_4px_0_0_rgba(0,0,0,0.22),0_12px_24px_-10px_rgba(15,23,42,0.45)]'

const WIDTHS: Record<CoverSize, string> = {
  small: 'w-16',
  medium: 'w-28',
  large: 'w-40 md:w-56',
}

/** Wider than 2:3, so the image fills the width of its space rather than the height. */
const isWide = (img: HTMLImageElement) =>
  img.naturalWidth > 0 && img.naturalWidth / img.naturalHeight > 2 / 3

/** A bigger, softer shadow for the one large cover in a page header. */
export const COVER_SHADOW_RAISED =
  'shadow-[inset_5px_0_0_rgba(0,0,0,0.25),0_30px_50px_-22px_rgba(15,23,42,0.6)]'

/**
 * A Book's Cover in a 2:3 space reserved up front so nothing shifts. The image is never cropped:
 * it is scaled to fit and sits at the bottom of the space, and the spine shadow and corners go on
 * the image itself, so a cover that is a little narrower or wider than 2:3 still looks bound. When
 * the image is missing or fails to load, a generated cover shows the title and author (PRD §6).
 */
export function Cover({
  cover,
  title,
  authorName,
  slug,
  dashed = false,
  size = 'medium',
  raised = false,
  priority = false,
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
  /** The large header cover: a deeper shadow. */
  raised?: boolean
  /** The page's main image (the Book header): load it at once instead of lazily. */
  priority?: boolean
  className?: string
}) {
  const url = coverUrl(cover, size)
  const [failed, setFailed] = useState(false)
  // Narrower than 2:3 (most covers) fills the height; wider fills the width. Decided on load.
  const [wide, setWide] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // An image that loaded or failed before hydration never fires its events in React, so check it.
  useEffect(() => {
    const img = imgRef.current
    if (!img?.complete) return
    if (img.naturalWidth === 0) setFailed(true)
    else setWide(isWide(img))
  }, [])

  if (!url || failed) {
    return (
      <GeneratedCover
        title={title}
        authorName={authorName}
        slug={slug ?? title}
        dashed={dashed}
        raised={raised}
        className={cn(WIDTHS[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'relative flex aspect-[2/3] shrink-0 items-end justify-center',
        WIDTHS[size],
        className,
      )}
    >
      <img
        ref={imgRef}
        src={url}
        srcSet={coverSrcSet(cover, size)}
        alt={copy.books.coverAlt(title)}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={cn(
          'block rounded-[3px_6px_6px_3px] bg-surface-raised object-contain',
          wide ? 'h-auto max-h-full w-full' : 'h-full max-w-full w-auto',
          raised ? COVER_SHADOW_RAISED : COVER_SHADOW,
        )}
        onLoad={(event) => setWide(isWide(event.currentTarget))}
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
  raised = false,
  className,
}: {
  title: string
  authorName?: string | null | undefined
  slug: string
  dashed?: boolean
  raised?: boolean
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
          : [generatedCoverClass(slug), raised ? COVER_SHADOW_RAISED : COVER_SHADOW],
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
