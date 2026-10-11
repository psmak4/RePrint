import type { Cover } from '@reprint/shared'

export type CoverSize = 'small' | 'medium' | 'large'

const OPEN_LIBRARY_SIZE: Record<CoverSize, string> = { small: 'S', medium: 'M', large: 'L' }

/**
 * Where to load a Cover from (PRD §6). Covers are requested by cover ID from the origin's image
 * host and never crawled. Returns null when the Cover has nothing to load, so the caller shows the
 * generated cover.
 */
export function coverUrl(cover: Cover | null, size: CoverSize): string | null {
  if (!cover) return null
  if (cover.url) return cover.url
  if (cover.origin === 'open_library' && cover.originRef) {
    return `https://covers.openlibrary.org/b/id/${encodeURIComponent(cover.originRef)}-${OPEN_LIBRARY_SIZE[size]}.jpg?default=false`
  }
  return null
}

/** The next size up for screens with two or more device pixels per CSS pixel (`large` is the top). */
const DENSER: Record<CoverSize, CoverSize | null> = {
  small: 'medium',
  medium: 'large',
  large: null,
}

/**
 * A `srcset` that adds the next Open Library size for high-density screens, so a 150 px cover is
 * drawn from a 320 px file on a retina display. Uploads and the largest size have one file only.
 */
export function coverSrcSet(cover: Cover | null, size: CoverSize): string | undefined {
  const denser = DENSER[size]
  if (!cover || cover.url || cover.origin !== 'open_library' || !cover.originRef || !denser) {
    return undefined
  }
  return `${coverUrl(cover, size)} 1x, ${coverUrl(cover, denser)} 2x`
}
