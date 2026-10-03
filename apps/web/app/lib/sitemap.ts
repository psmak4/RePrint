import type { SitemapChunk, SitemapIndex } from '@reprint/shared'

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9'

function lastModified(value: string | null): string {
  return value ? `<lastmod>${value}</lastmod>` : ''
}

/** A `<sitemapindex>` naming each chunk at this origin. */
export function renderSitemapIndex(origin: string, index: SitemapIndex): string {
  const entries = index.chunks
    .map(
      (chunk) =>
        `<sitemap><loc>${escapeXml(`${origin}/sitemaps/${chunk.number}.xml`)}</loc>${lastModified(chunk.lastModified)}</sitemap>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="${NAMESPACE}">${entries}</sitemapindex>`
}

/** A `<urlset>` of absolute URLs at this origin. */
export function renderSitemapChunk(origin: string, chunk: SitemapChunk): string {
  const entries = chunk.urls
    .map(
      (url) =>
        `<url><loc>${escapeXml(`${origin}${url.path}`)}</loc>${lastModified(url.lastModified)}</url>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${NAMESPACE}">${entries}</urlset>`
}

/** Paths crawlers must not fetch. Other noindex pages stay crawlable so the tag can be read. */
export const ROBOTS_DISALLOWED = ['/admin', '/settings']

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    ...ROBOTS_DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}
