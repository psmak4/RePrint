import { afterEach, describe, expect, it, vi } from 'vitest'
import { action } from './book-reached.js'

afterEach(() => vi.unstubAllGlobals())

const asData = (result: unknown) => result as { data: unknown; init: { status: number } }

function send(method: string, fetchMock: typeof fetch, slug = 'the-hobbit-0a1b2c') {
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request(`http://web.test/books/${slug}/reached`, { method })
  return action({ request, params: { slug } } as never)
}

describe('book reached action (D-200)', () => {
  it('forwards a POST to the API', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      Response.json({ slug: 'the-hobbit-0a1b2c' }),
    )
    expect(await send('POST', fetchMock as never)).toEqual({ slug: 'the-hobbit-0a1b2c' })
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(new URL(String(url)).pathname).toBe('/v1/books/the-hobbit-0a1b2c/reached')
    expect(init.method).toBe('POST')
  })

  it('passes the API refusal status through', async () => {
    const problem = { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Gone.' }
    const result = asData(
      await send('POST', (async () => Response.json(problem, { status: 404 })) as never),
    )
    expect(result.init.status).toBe(404)
  })

  it('rejects other methods and a bad slug without calling the API', async () => {
    const fetchMock = vi.fn()
    await expect(send('GET', fetchMock as never)).rejects.toMatchObject({
      init: { status: 405 },
    })
    await expect(send('POST', fetchMock as never, 'Nope!')).rejects.toMatchObject({
      init: { status: 404 },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
