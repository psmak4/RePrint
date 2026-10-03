import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderRobots, renderSitemapChunk, renderSitemapIndex } from '../lib/sitemap.js'
import { loader as robots } from './robots.js'
import { loader } from './sitemap.js'

afterEach(() => vi.unstubAllGlobals())

const ORIGIN = 'https://reprint.test'
const call = (path: string, params: Record<string, string> = {}) =>
  loader({ request: new Request(`${ORIGIN}${path}`), params } as never) as Promise<Response>

function stubApi(status: number, body: unknown) {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    urls.push(new URL(String(url)).pathname)
    return Response.json(body, { status })
  })
  return urls
}

describe('sitemap renderers', () => {
  it('names each chunk with an absolute URL in the index', () => {
    const xml = renderSitemapIndex(ORIGIN, {
      builtAt: '2026-10-03T00:00:00.000Z',
      chunks: [{ number: 2, urlCount: 5, lastModified: '2026-10-02T00:00:00.000Z' }],
    })
    expect(xml).toContain('<loc>https://reprint.test/sitemaps/2.xml</loc>')
    expect(xml).toContain('<lastmod>2026-10-02T00:00:00.000Z</lastmod>')
  })

  it('escapes XML characters in a URL', () => {
    const xml = renderSitemapChunk(ORIGIN, {
      urls: [{ path: '/books/a&b<c>', lastModified: null }],
    })
    expect(xml).toContain('https://reprint.test/books/a&amp;b&lt;c&gt;')
    expect(xml).not.toContain('<lastmod>')
  })

  it('robots.txt disallows admin and settings and names the sitemap', () => {
    const text = renderRobots(ORIGIN)
    expect(text).toContain('Disallow: /admin')
    expect(text).toContain('Disallow: /settings')
    expect(text).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`)
  })
})

describe('sitemap routes', () => {
  it('serves the index as XML', async () => {
    const urls = stubApi(200, {
      builtAt: '2026-10-03T00:00:00.000Z',
      chunks: [{ number: 1, urlCount: 2, lastModified: null }],
    })
    const response = await call('/sitemap.xml')
    expect(urls).toEqual(['/v1/sitemaps'])
    expect(response.headers.get('content-type')).toContain('application/xml')
    expect(await response.text()).toContain('<sitemapindex')
  })

  it('serves one chunk as XML', async () => {
    const urls = stubApi(200, { urls: [{ path: '/books/dune', lastModified: null }] })
    const response = await call('/sitemaps/1.xml', { chunk: '1.xml' })
    expect(urls).toEqual(['/v1/sitemaps/1'])
    expect(await response.text()).toContain('<loc>https://reprint.test/books/dune</loc>')
  })

  it('returns 404 for a malformed chunk name without calling the API', async () => {
    const urls = stubApi(200, {})
    expect((await call('/sitemaps/x', { chunk: 'x' })).status).toBe(404)
    expect(urls).toEqual([])
  })

  it('returns 404 when the API has no build yet', async () => {
    stubApi(404, { status: 404 })
    expect((await call('/sitemap.xml')).status).toBe(404)
  })

  it('returns 502 when the API fails', async () => {
    stubApi(500, {})
    expect((await call('/sitemap.xml')).status).toBe(502)
  })

  it('serves robots.txt as plain text', async () => {
    const response = robots({ request: new Request(`${ORIGIN}/robots.txt`) } as never)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('Disallow: /admin')
  })
})
