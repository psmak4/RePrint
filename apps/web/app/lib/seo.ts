import { APP_NAME } from '@reprint/shared'
import type { MetaDescriptor } from 'react-router'
import { copy } from '../copy/index.js'

/** The slice of a route's `meta` arguments the helper reads: the page path and the root loader's origin. */
export interface SeoArgs {
  location: { pathname: string }
  matches: ReadonlyArray<{ id: string; loaderData?: unknown } | undefined>
}

export interface PageMetaOptions {
  /** The full `<title>`. */
  title: string
  /** Falls back to the site description so every page has one. */
  description?: string
  /** Tells search engines to skip the page (admin, settings, auth, unverified profiles). */
  noindex?: boolean
  /** Replaces the canonical URL built from the page path (the Book, Author, and profile loaders build their own). */
  canonicalUrl?: string
  /** Query parameters that make a different page (such as `page`) and so stay in the canonical URL. */
  keepParams?: Record<string, string | undefined>
  /** Adds Open Graph tags (`og:type`, title, description, URL, and optional image). */
  openGraph?: { type: string; title?: string; image?: string | null }
}

/** The public origin the root loader read from the request, or null when the root loader failed. */
function siteOrigin(matches: SeoArgs['matches']): string | null {
  const data = matches.find((match) => match?.id === 'root')?.loaderData
  if (data && typeof data === 'object' && 'origin' in data && typeof data.origin === 'string') {
    return data.origin
  }
  return null
}

/**
 * The `meta` descriptors every page returns (PRD §7.4, §11): title, description, canonical URL, `noindex`
 * when asked, and Open Graph tags when the page is shareable.
 */
export function pageMeta(args: SeoArgs, options: PageMetaOptions): MetaDescriptor[] {
  const description = options.description ?? copy.seo.defaultDescription
  const canonicalUrl = options.canonicalUrl ?? buildCanonical(args, options.keepParams)
  const tags: MetaDescriptor[] = [
    { title: options.title },
    { name: 'description', content: description },
  ]
  if (canonicalUrl) tags.push({ tagName: 'link', rel: 'canonical', href: canonicalUrl })
  if (options.noindex) tags.push({ name: 'robots', content: 'noindex' })
  if (options.openGraph) {
    const { type, title, image } = options.openGraph
    tags.push(
      { property: 'og:type', content: type },
      { property: 'og:site_name', content: APP_NAME },
      { property: 'og:title', content: title ?? options.title },
      { property: 'og:description', content: description },
    )
    if (canonicalUrl) tags.push({ property: 'og:url', content: canonicalUrl })
    if (image) tags.push({ property: 'og:image', content: image })
  }
  return tags
}

function buildCanonical(args: SeoArgs, keepParams: PageMetaOptions['keepParams']): string | null {
  const origin = siteOrigin(args.matches)
  if (!origin) return null
  const url = new URL(args.location.pathname, origin)
  for (const [name, value] of Object.entries(keepParams ?? {})) {
    if (value) url.searchParams.set(name, value)
  }
  return url.toString()
}
