import { cn } from '@reprint/ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * A round photo that falls back when it has no image or the image fails to load (D-214): Author
 * photos and Member avatars use it, so a broken image never shows its alt text. `fallback` (initials)
 * is drawn in the same frame, which then carries the image role and the alt text.
 */
export function RoundPhoto({
  url,
  alt,
  className,
  fallback,
}: {
  url: string | null
  alt: string
  /** The frame's size and fill. */
  className: string
  fallback: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const [seenUrl, setSeenUrl] = useState(url)
  if (url !== seenUrl) {
    setSeenUrl(url)
    setFailed(false)
  }

  // An image that failed before hydration never fires `onError` in React, so check it once mounted.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  const frame = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    className,
  )
  if (!url || failed) {
    return (
      <div role="img" aria-label={alt} className={frame}>
        {fallback}
      </div>
    )
  }
  return (
    <div className={frame}>
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
