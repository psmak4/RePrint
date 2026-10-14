/**
 * Source Markdown parsed on the server into the few elements it may render as (D-202), so pages
 * draw it without shipping a Markdown parser to the browser (M10-T08). Strings are text.
 */
export type RichNode =
  | string
  | { tag: 'p' | 'em' | 'strong' | 'ul' | 'ol' | 'li'; children: RichNode[] }
  | { tag: 'a'; href: string; children: RichNode[] }
  | { tag: 'br' }
export type RichTree = RichNode[]

/**
 * Hosts never linked: a Source's own pages would put its IDs in front of readers (PRD §5). The
 * Catalog already unlinks them on import (D-202); this also covers text stored before that.
 */
const UNLINKED_HOSTS = /(^|\.)openlibrary\.org$/i

/** The address a link may point to, or `null` to show only its text: absolute web addresses only. */
export function linkHref(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return UNLINKED_HOSTS.test(parsed.hostname) ? null : parsed.href
  } catch {
    return null
  }
}
