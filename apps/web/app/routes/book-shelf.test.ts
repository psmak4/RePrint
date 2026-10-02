import { afterEach, describe, expect, it, vi } from 'vitest'
import { action } from './book-shelf.js'

afterEach(() => vi.unstubAllGlobals())

const asData = (result: unknown) => result as { data: unknown; init: { status: number } }

function send(method: string, fetchMock: typeof fetch, body?: unknown, slug = 'dune-0a1b2c') {
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request(`http://web.test/books/${slug}/shelf`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return action({ request, params: { slug } } as never)
}

describe('book shelf action', () => {
  it('forwards PUT with the shelf and DELETE without a body', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ shelf: 'read' }))
    expect(await send('PUT', fetchMock as never, { shelf: 'read' })).toEqual({ shelf: 'read' })
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(new URL(String(url)).pathname).toBe('/v1/books/dune-0a1b2c/shelf')
    expect(JSON.parse(String(init.body))).toEqual({ shelf: 'read' })

    fetchMock.mockResolvedValueOnce(Response.json({ shelf: null }))
    expect(await send('DELETE', fetchMock as never)).toEqual({ shelf: null })
    const [, deleteInit] = fetchMock.mock.calls[1] as [URL, RequestInit]
    expect(deleteInit.method).toBe('DELETE')
  })

  it('passes the API refusal status through (a Visitor gets 401)', async () => {
    const problem = { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Sign in.' }
    const result = asData(
      await send('PUT', (async () => Response.json(problem, { status: 401 })) as never, {
        shelf: 'read',
      }),
    )
    expect(result.init.status).toBe(401)
  })

  it('rejects a bad slug or shelf without calling the API', async () => {
    const fetchMock = vi.fn()
    await expect(send('PUT', fetchMock as never, { shelf: 'read' }, 'Nope!')).rejects.toMatchObject(
      {
        init: { status: 404 },
      },
    )
    await expect(send('PUT', fetchMock as never, { shelf: 'favourite' })).rejects.toMatchObject({
      init: { status: 400 },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
