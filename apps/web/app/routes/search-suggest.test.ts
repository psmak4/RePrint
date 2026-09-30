import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './search-suggest.js'

afterEach(() => vi.unstubAllGlobals())

function ask(fetchMock: typeof fetch, q = 'dune') {
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request(`http://web.test/search/suggest?q=${q}`)
  return loader({ request } as never)
}

describe('search suggest loader', () => {
  it('passes the query to the API and returns its suggestions', async () => {
    const fetchMock = vi.fn(async (_url: URL) => Response.json({ books: [], authors: [] }))
    expect(await ask(fetchMock as never, 'du ne')).toEqual({ books: [], authors: [] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/search/suggest?q=du%20ne')
  })

  it('returns no suggestions when the API is down', async () => {
    const result = (await ask(async () => {
      throw new Error('down')
    })) as { data: unknown; init: { status: number } }
    expect(result.data).toEqual({ books: [], authors: [] })
    expect(result.init.status).toBe(502)
  })
})
