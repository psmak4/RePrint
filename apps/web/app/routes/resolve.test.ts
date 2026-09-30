import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './resolve.js'

afterEach(() => vi.unstubAllGlobals())

const ref = 'a'.repeat(22)

function ask(fetchMock: typeof fetch, search = `?ref=${ref}`) {
  vi.stubGlobal('fetch', fetchMock)
  return loader({ request: new Request(`http://web.test/resolve${search}`) } as never) as Promise<
    Response & { data?: { state: string; ref: string | null }; init?: { status: number } }
  >
}

describe('resolve loader', () => {
  it('resolves the candidate and redirects to the Book', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) =>
      Response.json({ slug: 'dune' }),
    )
    const response = await ask(fetchMock as never)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/books/dune')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(new URL(String(url)).pathname).toBe('/v1/books/resolve')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ ref })
  })

  it('reports a retryable failure on 503', async () => {
    const result = await ask((async () => new Response('{}', { status: 503 })) as never)
    expect(result.init?.status).toBe(503)
    expect(result.data).toEqual({ state: 'failed', ref })
  })

  it('reports a retryable failure when the API is unreachable', async () => {
    const result = await ask((async () => {
      throw new Error('down')
    }) as never)
    expect(result.init?.status).toBe(503)
    expect(result.data?.state).toBe('failed')
  })

  it('reports not found for an expired reference', async () => {
    const result = await ask((async () => new Response('{}', { status: 404 })) as never)
    expect(result.init?.status).toBe(404)
    expect(result.data?.state).toBe('notFound')
  })

  it('does not call the API for a missing or malformed ref', async () => {
    const fetchMock = vi.fn()
    const result = await ask(fetchMock as never, '?ref=nope')
    expect(result.data?.state).toBe('notFound')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
