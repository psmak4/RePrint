import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader, meta } from './author.js'

afterEach(() => vi.unstubAllGlobals())

const author = {
  id: '0192a3b4-0000-7000-8000-000000000009',
  slug: 'frank-herbert',
  name: 'Frank Herbert',
  alternateNames: [],
  bio: 'An American science fiction writer.',
  birthDate: '1920-10-08',
  deathDate: '1986-02-11',
  photo: null,
  works: [],
}

function load(handler: (url: URL) => Response, slug = 'frank-herbert') {
  vi.stubGlobal('fetch', async (url: URL) => handler(new URL(String(url))))
  return loader({
    request: new Request(`https://reprint.test/authors/${slug}`),
    params: { slug },
  } as never)
}

const respond = (url: URL) =>
  url.pathname === '/v1/authors/frank-herbert'
    ? Response.json(author)
    : new Response(null, { status: 404 })

describe('author loader', () => {
  it('loads the Author with the canonical URL and meta tags', async () => {
    const result = await load(respond)
    expect(result.author.name).toBe('Frank Herbert')
    expect(result.canonicalUrl).toBe('https://reprint.test/authors/frank-herbert')
    const tags = meta({ loaderData: result } as never)
    expect(tags).toContainEqual({ title: 'Frank Herbert | RePrint' })
    expect(tags).toContainEqual({
      name: 'description',
      content: 'An American science fiction writer.',
    })
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/authors/frank-herbert',
    })
    expect(tags).toContainEqual({ property: 'og:title', content: 'Frank Herbert' })
  })

  it('returns Person and BreadcrumbList JSON-LD', async () => {
    const result = await load(respond)
    expect(result.jsonLd).toMatchObject([
      {
        '@type': 'Person',
        name: 'Frank Herbert',
        url: 'https://reprint.test/authors/frank-herbert',
      },
      { '@type': 'BreadcrumbList' },
    ])
  })

  it('builds a description when there is no bio and trims a long one', async () => {
    const none = await load(() => Response.json({ ...author, bio: null }))
    expect(none.metaDescription).toBe(
      'Books by Frank Herbert, with ratings and reviews on RePrint.',
    )
    const long = await load(() => Response.json({ ...author, bio: 'word '.repeat(100) }))
    expect(long.metaDescription.length).toBeLessThanOrEqual(160)
    expect(long.metaDescription.endsWith('…')).toBe(true)
  })

  it('answers 404 for an unknown or malformed slug', async () => {
    const missing = await load(respond, 'nope-123').catch((thrown) => thrown)
    expect(missing.init.status).toBe(404)
    const bad = await load(respond, 'Not_A_Slug').catch((thrown) => thrown)
    expect(bad.init.status).toBe(404)
  })

  it('answers 502 when the API fails or is down', async () => {
    const failed = await load(() => new Response(null, { status: 500 })).catch((t) => t)
    expect(failed.init.status).toBe(502)
    const down = await load(() => {
      throw new Error('down')
    }).catch((thrown) => thrown)
    expect(down.init.status).toBe(502)
  })
})
