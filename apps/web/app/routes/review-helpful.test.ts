import { afterEach, describe, expect, it, vi } from 'vitest'
import { action } from './review-helpful.js'

afterEach(() => vi.unstubAllGlobals())

const id = '0192a3b4-0000-7000-8000-000000000001'
const asData = (result: unknown) => result as { data: unknown; init: { status: number } }

function send(method: string, fetchMock: typeof fetch, reviewId = id) {
  vi.stubGlobal('fetch', fetchMock)
  const request = new Request(`http://web.test/reviews/${reviewId}/helpful`, { method })
  return action({ request, params: { id: reviewId } } as never)
}

describe('review helpful action', () => {
  it('forwards POST and DELETE to the API and returns the new vote state', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      Response.json({ helpful: true, helpfulCount: 3 }),
    )
    expect(await send('POST', fetchMock as never)).toEqual({ helpful: true, helpfulCount: 3 })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/reviews/${id}/helpful`)
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.method ?? 'POST').toBe('POST')
    await send('DELETE', fetchMock as never)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('passes the API refusal status through', async () => {
    const problem = { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'No.' }
    const result = asData(
      await send('POST', (async () => Response.json(problem, { status: 403 })) as never),
    )
    expect(result.init.status).toBe(403)
  })

  it('answers 404 for a malformed id without calling the API', async () => {
    const fetchMock = vi.fn()
    await expect(send('POST', fetchMock as never, 'nope')).rejects.toMatchObject({
      init: { status: 404 },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
