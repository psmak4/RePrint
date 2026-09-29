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
