import { afterEach, describe, expect, it, vi } from 'vitest'
import { action } from './review-report.js'

const reviewId = '0192a3b4-0000-7000-8000-000000000001'
afterEach(() => vi.unstubAllGlobals())

const args = (body: unknown, id = reviewId, method = 'POST') =>
  ({
    request: new Request(`https://reprint.test/reviews/${id}/report`, {
      method,
      body: method === 'GET' ? null : JSON.stringify(body),
    }),
    params: { id },
  }) as never

async function thrown(run: () => unknown) {
  return Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
}

describe('review report action', () => {
  it('files the report with the API', async () => {
    const calls: { path: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: URL, init?: RequestInit) => {
      calls.push({ path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) })
      return Response.json({ status: 'report_received' }, { status: 201 })
    })
    const result = await action(args({ reason: 'spam' }))
    expect(calls).toEqual([{ path: `/v1/reviews/${reviewId}/reports`, body: { reason: 'spam' } }])
    expect(result).toEqual({ status: 'report_received' })
  })

  it('asks for a note on "other" without calling the API', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = (await action(args({ reason: 'other' }))) as {
      data: { fieldErrors: { note: string } }
      init: { status: number }
    }
    expect(result.init.status).toBe(400)
    expect(result.data.fieldErrors.note).toBe('Tell us what is wrong.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('passes a refusal (such as a repeat report) back', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'You already reported this review.',
        },
        { status: 409 },
      ),
    )
    const result = (await action(args({ reason: 'spam' }))) as {
      data: { formError: string }
      init: { status: number }
    }
    expect(result.init.status).toBe(409)
    expect(result.data.formError).toBe('You already reported this review.')
  })

  it('answers 404 to a bad id and 405 to other methods', async () => {
    const bad = (await thrown(() => action(args({}, 'nope')))) as { init: { status: number } }
    expect(bad.init.status).toBe(404)
    const get = (await thrown(() => action(args({}, reviewId, 'PUT')))) as {
      init: { status: number }
    }
    expect(get.init.status).toBe(405)
  })
})
