import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader as genreLoader, meta as genreMeta } from './genre.js'
import { loader as genresLoader } from './genres.js'
import { loader as seriesLoader } from './series.js'

afterEach(() => vi.unstubAllGlobals())

const book = {
  id: '0192a3b4-0000-7000-8000-000000000001',
  slug: 'dune-abc121',
  title: 'Dune',
  subtitle: null,
  cover: null,
  firstPublishedYear: 1965,
  contributions: [],
  rating: { average: 4.5, count: 2, distribution: [0, 0, 0, 1, 1] },
}
const genreDetail = {
  genre: { slug: 'science-fiction', name: 'Science Fiction', description: null },
  parent: null,
  children: [],
  items: [book],
  page: 1,
  pageSize: 20,
  hasMore: false,
}

function stub(handler: (url: URL) => Response) {
  const seen: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    seen.push(String(url))
    return handler(new URL(String(url)))
  })
  return seen
}

const run = <T>(call: () => Promise<T>) => call().catch((thrown) => thrown)

describe('genres loader', () => {
  it('loads the Genre tree and answers 502 when the API fails', async () => {
    stub(() => Response.json({ items: [] }))
    const ok = await genresLoader({ request: new Request('https://reprint.test/genres') } as never)
    expect(ok.items).toEqual([])
    stub(() => new Response(null, { status: 500 }))
    const failed = await run(() =>
      genresLoader({ request: new Request('https://reprint.test/genres') } as never),
    )
    expect(failed.init.status).toBe(502)
  })
})

describe('genre loader', () => {
  const load = (search: string, slug = 'science-fiction') =>
    genreLoader({
      request: new Request(`https://reprint.test/genres/${slug}${search}`),
      params: { slug },
    } as never)

  it('passes the sort and page from the URL to the API', async () => {
    const seen = stub(() => Response.json(genreDetail))
    const result = await load('?sort=most_reviewed&page=3')
    expect(seen[0]).toContain('/v1/genres/science-fiction?sort=most_reviewed&page=3')
    expect(result.sort).toBe('most_reviewed')
    expect(genreMeta({ loaderData: result } as never)).toContainEqual({
      title: 'Science Fiction | RePrint',
    })
  })

  it('falls back to the defaults for an unknown sort or page', async () => {
    const seen = stub(() => Response.json(genreDetail))
    const result = await load('?sort=bogus&page=0')
    expect(seen[0]).toContain('?sort=top_rated&page=1')
    expect(result.sort).toBe('top_rated')
  })

  it('answers 404 for an unknown or malformed slug and 502 on failure', async () => {
    stub(() => new Response(null, { status: 404 }))
    expect((await run(() => load(''))).init.status).toBe(404)
    expect((await run(() => load('', 'Not_A_Slug'))).init.status).toBe(404)
    stub(() => new Response(null, { status: 500 }))
    expect((await run(() => load(''))).init.status).toBe(502)
  })
})

describe('series loader', () => {
  const load = (slug = 'dune-chronicles') =>
    seriesLoader({
      request: new Request(`https://reprint.test/series/${slug}`),
      params: { slug },
    } as never)

  it('loads the Series in reading order', async () => {
    stub(() =>
      Response.json({
        series: { slug: 'dune-chronicles', name: 'Dune Chronicles', description: null },
        items: [{ position: 1, book }],
      }),
    )
    const result = await load()
    expect(result.items[0]?.position).toBe(1)
  })

  it('answers 404 and 502', async () => {
    stub(() => new Response(null, { status: 404 }))
    expect((await run(() => load())).init.status).toBe(404)
    expect((await run(() => load('Not_A_Slug'))).init.status).toBe(404)
    stub(() => new Response(null, { status: 503 }))
    expect((await run(() => load())).init.status).toBe(502)
  })
})
