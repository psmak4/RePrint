import type { Cover as CoverData } from '@reprint/shared'
import { cn } from '@reprint/ui'
import { useEffect, useRef, useState } from 'react'
import { copy } from '../../copy/index.js'
import { type CoverSize, coverUrl } from '../../lib/cover-url.js'

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
  size = 'medium',
  className,
}: {
  cover: CoverData | null
  title: string
  authorName?: string | null
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
    'relative aspect-[2/3] shrink-0 overflow-hidden rounded-md border border-border bg-surface',
    WIDTHS[size],
    className,
  )

  if (!url || failed) {
    return (
      <div role="img" aria-label={copy.books.coverAlt(title)} className={frame}>
        <div
          aria-hidden="true"
          className="flex h-full flex-col justify-between gap-2 bg-surface-raised p-2 text-center"
        >
          <span className="line-clamp-4 text-sm font-semibold break-words">{title}</span>
          {authorName ? (
            <span className="line-clamp-2 text-xs break-words text-muted-foreground">
              {authorName}
            </span>
          ) : null}
        </div>
      </div>
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
