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
