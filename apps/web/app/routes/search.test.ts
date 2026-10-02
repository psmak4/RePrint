import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './search.js'

afterEach(() => vi.unstubAllGlobals())

const empty = {
  items: [],
  isbnMatch: null,
  page: 1,
  pageSize: 20,
  hasMore: false,
  sourceUnavailable: false,
}

function ask(fetchMock: typeof fetch, search: string) {
  vi.stubGlobal('fetch', fetchMock)
  return loader({ request: new Request(`http://web.test/search${search}`) } as never)
}

const tree = {
  items: [
    {
      slug: 'fiction',
      name: 'Fiction',
      description: null,
      featured: true,
      children: [
        {
          slug: 'science-fiction',
          name: 'Science Fiction',
          description: null,
          featured: false,
          children: [],
        },
      ],
    },
  ],
}

/** Answers `/v1/genres` with the tree and everything else with `search`. */
function routed(search: unknown) {
  return vi.fn(async (url: URL) =>
    String(url).includes('/v1/genres') ? Response.json(tree) : Response.json(search),
  )
}

function searchCall(fetchMock: ReturnType<typeof routed>): URL {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/v1/search'))
  return new URL(String(call?.[0]))
}

describe('search loader', () => {
  it('forwards the query, filters, sort, and page to the API', async () => {
    const fetchMock = routed(empty)
    const result = (await ask(
      fetchMock as never,
      '?q=dune&decade=1960&sort=newest&page=2&bogus=1',
    )) as { query: { q: string } }
    expect(result.query.q).toBe('dune')
    const url = searchCall(fetchMock)
    expect(url.pathname).toBe('/v1/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'dune',
      decade: '1960',
      sort: 'newest',
      page: '2',
    })
  })

  it('drops bad parameters instead of failing', async () => {
    const fetchMock = routed(empty)
    await ask(fetchMock as never, '?q=dune&decade=1961&minRating=9&language=')
    const url = searchCall(fetchMock)
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'dune' })
  })

  it('does not search for a query under 2 characters', async () => {
    const fetchMock = routed(empty)
    const result = (await ask(fetchMock as never, '?q=d')) as { results: unknown }
    expect(result.results).toBeNull()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/search'))).toBe(false)
  })

  it('loads the Genre list for the filter select on the Books tab', async () => {
    const result = (await ask(routed(empty) as never, '?q=dune&genre=science-fiction')) as {
      genres: { slug: string }[]
      query: { genre: string }
    }
    expect(result.genres.map((genre) => genre.slug)).toEqual(['fiction'])
    expect(result.query.genre).toBe('science-fiction')
  })

  it('skips the Genre list on the Authors tab', async () => {
    const fetchMock = routed(empty)
    const result = (await ask(fetchMock as never, '?q=herbert&type=authors')) as {
      genres: unknown[]
    }
    expect(result.genres).toEqual([])
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/v1/genres'))).toBe(false)
  })

  it('still searches when the Genre list cannot load', async () => {
    const fetchMock = vi.fn(async (url: URL) =>
      String(url).includes('/v1/genres')
        ? new Response(null, { status: 500 })
        : Response.json(empty),
    )
    const result = (await ask(fetchMock as never, '?q=dune')) as {
      failed: boolean
      genres: unknown[]
    }
    expect(result.failed).toBe(false)
    expect(result.genres).toEqual([])
  })

  it('redirects an ISBN with a stored Book straight to it', async () => {
    const response = await ask(
      (async () => Response.json({ ...empty, isbnMatch: { kind: 'book', slug: 'dune' } })) as never,
      '?q=9780441172719',
    ).catch((thrown: Response) => thrown)
    expect((response as Response).status).toBe(302)
    expect((response as Response).headers.get('location')).toBe('/books/dune')
  })

  it('redirects an ISBN found only at the Source to the resolve flow', async () => {
    const response = await ask(
      (async () =>
        Response.json({
          ...empty,
          isbnMatch: { kind: 'candidate', ref: 'abcdefghijklmnopqrstuvwx' },
        })) as never,
      '?q=9780441172719',
    ).catch((thrown: Response) => thrown)
    expect((response as Response).headers.get('location')).toBe(
      '/resolve?ref=abcdefghijklmnopqrstuvwx',
    )
  })

  it('reports a failure when the API is down', async () => {
    const result = (await ask(
      (async () => {
        throw new Error('down')
      }) as never,
      '?q=dune',
    )) as { data: { failed: boolean }; init: { status: number } }
    expect(result.data.failed).toBe(true)
    expect(result.init.status).toBe(502)
  })
})
