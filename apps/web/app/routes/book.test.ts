import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader, meta } from './book.js'

afterEach(() => vi.unstubAllGlobals())

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const rating = { average: null, count: 0, distribution: [0, 0, 0, 0, 0] }
const herbert = { id: id(9), slug: 'frank-herbert', name: 'Frank Herbert' }

const book = {
  id: id(1),
  slug: 'dune-abc123',
  title: 'Dune',
  subtitle: null,
  description: 'A desert planet.',
  firstPublishedYear: 1965,
  originalLanguage: 'en',
  primaryEditionId: null,
  cover: null,
  contributions: [{ author: herbert, role: 'author', position: 0 }],
  series: [],
  genres: [],
  primaryEdition: null,
  editionCount: 0,
  rating,
}

const summary = (n: number, slug: string) => ({
  id: id(n),
  slug,
  title: slug,
  subtitle: null,
  cover: null,
  firstPublishedYear: null,
  contributions: [],
  rating,
})

function respond(url: URL) {
  if (url.pathname === '/v1/books/dune-abc123') return Response.json(book)
  if (url.pathname === '/v1/books/dune-abc123/editions') return Response.json({ items: [] })
  if (url.pathname === '/v1/authors/frank-herbert') {
    const others = [2, 3, 4, 5, 6, 7, 8].map((n) => summary(n, `other-${n}`))
    return Response.json({
      ...herbert,
      alternateNames: [],
      bio: null,
      birthDate: null,
      deathDate: null,
      photo: null,
      works: [{ role: 'author', books: [summary(1, 'dune-abc123'), ...others] }],
    })
  }
  return new Response(null, { status: 404 })
}

function load(handler: (url: URL) => Response | Promise<Response>, slug = 'dune-abc123') {
  vi.stubGlobal('fetch', async (url: URL) => handler(new URL(String(url))))
  return loader({
    request: new Request(`https://reprint.test/books/${slug}`),
    params: { slug },
  } as never)
}

describe('book loader', () => {
  it('loads the Book, Editions, and up to 6 more Books by the author without this one', async () => {
    const result = await load(respond)
    expect(result.book.title).toBe('Dune')
    expect(result.moreByAuthor?.books).toHaveLength(6)
    expect(result.moreByAuthor?.books.map((b) => b.slug)).not.toContain('dune-abc123')
  })

  it('gives the canonical URL and meta description', async () => {
    const result = await load(respond)
    expect(result.canonicalUrl).toBe('https://reprint.test/books/dune-abc123')
    expect(result.metaDescription).toBe('A desert planet.')
    const tags = meta({ loaderData: result } as never)
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/books/dune-abc123',
    })
    expect(tags).toContainEqual({ name: 'description', content: 'A desert planet.' })
    expect(tags).toContainEqual({ property: 'og:title', content: 'Dune' })
    expect(tags).toContainEqual({ property: 'og:type', content: 'book' })
    expect(tags).toContainEqual({
      property: 'og:url',
      content: 'https://reprint.test/books/dune-abc123',
    })
  })

  it('builds a description when the Book has none and trims a long one', async () => {
    const none = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json({ ...book, description: null })
        : respond(url),
    )
    expect(none.metaDescription).toBe('Dune by Frank Herbert: ratings and reviews on RePrint.')
    const long = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json({ ...book, description: 'word '.repeat(100) })
        : respond(url),
    )
    expect(long.metaDescription.length).toBeLessThanOrEqual(160)
    expect(long.metaDescription.endsWith('…')).toBe(true)
  })

  it('still renders the Book when Editions and the author fail', async () => {
    const result = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json(book)
        : new Response(null, { status: 500 }),
    )
    expect(result.editions).toEqual([])
    expect(result.moreByAuthor).toBeNull()
  })

  it('answers 404 for an unknown or malformed slug', async () => {
    const missing = await load(respond, 'nope-123').catch((thrown) => thrown)
    expect(missing.init.status).toBe(404)
    const bad = await load(respond, 'Not_A_Slug').catch((thrown) => thrown)
    expect(bad.init.status).toBe(404)
  })

  it('answers 502 when the API is down', async () => {
    const down = await load(() => {
      throw new Error('down')
    }).catch((thrown) => thrown)
    expect(down.init.status).toBe(502)
  })
})
