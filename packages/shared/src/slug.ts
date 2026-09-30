export const SLUG_SUFFIX_LENGTH = 6
export const SLUG_BASE_MAX_LENGTH = 80

/** Used when a title has no letters or digits after unaccenting (for example, a title in CJK script). */
const FALLBACK_SLUG_BASE = 'untitled'

/**
 * Builds a readable slug such as `the-left-hand-of-darkness-0192a3` (PRD §5.4): the title unaccented,
 * lowercased, and joined with hyphens, then the last 6 hex characters of the record's ID. The suffix
 * comes from the random end of a UUIDv7, since its start is a timestamp that repeats for hours.
 */
export function makeSlug(title: string, id: string): string {
  let base = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length > SLUG_BASE_MAX_LENGTH) {
    base = base.slice(0, SLUG_BASE_MAX_LENGTH)
    const lastHyphen = base.lastIndexOf('-')
    if (lastHyphen > 0) base = base.slice(0, lastHyphen)
    base = base.replace(/-+$/, '')
  }
  const suffix = id.replace(/-/g, '').toLowerCase().slice(-SLUG_SUFFIX_LENGTH)
  return `${base === '' ? FALLBACK_SLUG_BASE : base}-${suffix}`
}
