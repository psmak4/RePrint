import type { RouteConfigEntry } from '@react-router/dev/routes'
import type { MetaDescriptor } from 'react-router'
import { describe, expect, it } from 'vitest'
import { metaArgs } from '../lib/seo.testing.js'
import routes from '../routes.js'

type MetaFunction = (args: never) => MetaDescriptor[]
const modules = import.meta.glob<{ default?: unknown; meta?: MetaFunction }>('./*.{ts,tsx}')

interface Page {
  file: string
  path: string
  /** Route files from the root down to this one; the last with a `meta` export wins, as in React Router. */
  chain: string[]
}

function walk(entries: RouteConfigEntry[], parentPath: string, chain: string[]): Page[] {
  return entries.flatMap((entry) => {
    const path = [parentPath, entry.path].filter(Boolean).join('/')
    const here = [...chain, entry.file]
    return [
      { file: entry.file, path: `/${path}`.replace(/\/$/, '') || '/', chain: here },
      ...walk(entry.children ?? [], path, here),
    ]
  })
}

/** What each dynamic page's loader hands to `meta`. */
const loaderData: Record<string, unknown> = {
  'routes/book.tsx': {
    book: { title: 'Dune', cover: null, primaryEdition: null },
    canonicalUrl: 'https://reprint.test/books/dune',
    metaDescription: 'A desert planet.',
  },
  'routes/author.tsx': {
    author: { name: 'Frank Herbert', photo: null },
    canonicalUrl: 'https://reprint.test/authors/frank-herbert',
    metaDescription: 'Books by Frank Herbert.',
  },
  'routes/genre.tsx': { detail: { genre: { name: 'Fantasy' } }, sort: 'top_rated', page: 1 },
  'routes/series.tsx': { series: { name: 'Dune' } },
  'routes/search.tsx': { query: { q: 'dune' } },
  'routes/profile.tsx': {
    profile: { displayName: 'Ada', reviewCount: 2, verified: true },
    canonicalUrl: 'https://reprint.test/u/ada',
  },
  'routes/library.tsx': null,
}

const noindexPrefixes = [
  '/admin',
  '/settings',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/confirm-email-change',
  '/search',
  '/resolve',
]

const pages = walk(routes as RouteConfigEntry[], '', [])

async function metaFor(page: Page, data: unknown): Promise<MetaDescriptor[] | null> {
  const concrete = page.path.replace(/:\w+/g, 'x')
  for (const file of [...page.chain].reverse()) {
    const mod = await modules[`./${file.replace(/^routes\//, '')}`]?.()
    if (mod?.meta) {
      const own = file === page.file
      return mod.meta(
        metaArgs(concrete, {
          loaderData: own ? data : null,
          params: { slug: 'x', username: 'x', id: 'x' },
        }) as never,
      )
    }
  }
  return null
}

describe('SEO meta across the route manifest', () => {
  it('finds the page routes', () => {
    expect(pages.length).toBeGreaterThan(20)
  })

  for (const page of pages) {
    it(`${page.path} (${page.file}) has a canonical URL and meta description`, async () => {
      const mod = await modules[`./${page.file.replace(/^routes\//, '')}`]?.()
      // Resource routes (no component) return files or redirects, not HTML.
      if (!mod?.default) return
      const tags = await metaFor(page, loaderData[page.file])
      expect(tags, `${page.file} (or a parent route) must export meta`).not.toBeNull()
      const canonical = tags?.find((tag) => 'rel' in tag && tag.rel === 'canonical')
      expect(canonical, 'canonical link').toBeDefined()
      expect(canonical && 'href' in canonical ? canonical.href : '').toMatch(
        /^https:\/\/reprint\.test\//,
      )
      const description = tags?.find((tag) => 'name' in tag && tag.name === 'description')
      expect(
        description && 'content' in description ? String(description.content).length : 0,
      ).toBeGreaterThan(0)

      const noindex = tags?.some(
        (tag) => 'name' in tag && tag.name === 'robots' && tag.content === 'noindex',
      )
      const expected = noindexPrefixes.some(
        (prefix) => page.path === prefix || page.path.startsWith(`${prefix}/`),
      )
      expect(noindex ?? false, `noindex on ${page.path}`).toBe(
        expected || page.path.endsWith('/library'),
      )
    })
  }

  it('gives Book, Author, Genre, Series, and profile pages Open Graph tags', async () => {
    for (const file of ['book', 'author', 'genre', 'series', 'profile']) {
      const page = pages.find((entry) => entry.file === `routes/${file}.tsx`)
      expect(page, file).toBeDefined()
      if (!page) continue
      const tags = (await metaFor(page, loaderData[page.file])) ?? []
      for (const property of ['og:type', 'og:title', 'og:description', 'og:url']) {
        expect(
          tags.some((tag) => 'property' in tag && tag.property === property),
          `${file} ${property}`,
        ).toBe(true)
      }
    }
  })

  it('marks the profile of an unverified Member noindex', async () => {
    const { meta } = await import('./profile.js')
    const data = {
      profile: { displayName: 'Ada', reviewCount: 0, verified: false },
      canonicalUrl: 'https://reprint.test/u/ada',
    }
    expect(meta(metaArgs('/u/ada', { loaderData: data }) as never)).toContainEqual({
      name: 'robots',
      content: 'noindex',
    })
  })

  it('keeps the page number in a paginated Genre canonical URL', async () => {
    const { meta } = await import('./genre.js')
    const data = { detail: { genre: { name: 'Fantasy' } }, sort: 'top_rated', page: 3 }
    expect(meta(metaArgs('/genres/fantasy', { loaderData: data }) as never)).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/genres/fantasy?page=3',
    })
  })
})
