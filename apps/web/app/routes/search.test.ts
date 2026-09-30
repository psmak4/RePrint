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

describe('search loader', () => {
  it('forwards the query, filters, sort, and page to the API', async () => {
    const fetchMock = vi.fn(async (_url: URL) => Response.json(empty))
    const result = (await ask(
      fetchMock as never,
      '?q=dune&decade=1960&sort=newest&page=2&bogus=1',
    )) as { query: { q: string } }
    expect(result.query.q).toBe('dune')
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'dune',
      decade: '1960',
      sort: 'newest',
      page: '2',
    })
  })

  it('drops bad parameters instead of failing', async () => {
    const fetchMock = vi.fn(async (_url: URL) => Response.json(empty))
    await ask(fetchMock as never, '?q=dune&decade=1961&minRating=9&language=')
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'dune' })
  })

  it('does not call the API for a query under 2 characters', async () => {
    const fetchMock = vi.fn()
    const result = (await ask(fetchMock as never, '?q=d')) as { results: unknown }
    expect(result.results).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
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
