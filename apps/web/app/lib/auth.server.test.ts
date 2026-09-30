import { describe, expect, it, vi } from 'vitest'
import { forwardCookies, loadSession, toFormFailure } from './auth.server.js'

const problem = (over: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title: 'Bad Request',
  status: 400,
  detail: 'Nope.',
  ...over,
})

describe('toFormFailure', () => {
  it('maps body.* paths to field names, keeping the first message per field', () => {
    const result = toFormFailure(
      problem({
        errors: [
          { path: 'body.username', message: 'Taken.' },
          { path: 'body.username', message: 'Other.' },
          { path: 'body.password', message: 'Breached.' },
        ],
      }),
      'fallback',
    )
    expect(result).toEqual({ fieldErrors: { username: 'Taken.', password: 'Breached.' } })
  })

  it('uses the detail for problems without field errors, and the fallback without a body', () => {
    expect(toFormFailure(problem(), 'fallback')).toEqual({ formError: 'Nope.' })
    expect(toFormFailure(undefined, 'fallback')).toEqual({ formError: 'fallback' })
  })
})

describe('forwardCookies', () => {
  it('copies every Set-Cookie header', () => {
    const from = new Response(null, {
      headers: [
        ['set-cookie', 'a=1; Path=/'],
        ['set-cookie', 'b=2'],
      ],
    })
    const to = new Headers()
    forwardCookies(from, to)
    expect(to.getSetCookie()).toEqual(['a=1; Path=/', 'b=2'])
  })
})

describe('loadSession', () => {
  it('degrades to a Visitor when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const session = await loadSession(new Request('http://www.reprint.test/'))
    expect(session).toEqual({ signupsOpen: false, viewer: null })
    vi.unstubAllGlobals()
  })
})

describe('sendToApi', () => {
  const request = new Request('http://web.test/settings/avatar', { method: 'POST' })

  async function sent(body: unknown) {
    const { sendToApi } = await import('./auth.server.js')
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendToApi(request, 'POST', '/v1/me/avatar', body, 'fallback')
    vi.unstubAllGlobals()
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    return { result, init }
  }

  it('sends JSON with a content type', async () => {
    const { result, init } = await sent({ a: 1 })
    expect(result.ok).toBe(true)
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('sends FormData untouched so the runtime sets the multipart boundary', async () => {
    const form = new FormData()
    form.set('file', new File(['x'], 'a.png'))
    const { init } = await sent(form)
    expect(init.body).toBe(form)
    expect(new Headers(init.headers).has('content-type')).toBe(false)
  })
})
