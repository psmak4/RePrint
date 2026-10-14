import { RouterContextProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasSessionCookie, sessionMiddleware, viewerSession } from './session.server.js'

afterEach(() => vi.unstubAllGlobals())

const MEMBER = {
  signupsOpen: true,
  viewer: {
    id: '0192a3b4-0000-7000-8000-000000000001',
    username: 'ada',
    displayName: 'Ada',
    verified: true,
    permissions: [],
  },
}

/** Counts the API's session lookups and answers each with `body`. */
function stubSessionApi(body: unknown = MEMBER) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    calls.push(new URL(String(url)).pathname)
    return Response.json(body)
  })
  return calls
}

const request = () =>
  new Request('https://reprint.test/books/dune', { headers: { cookie: 'rp_session=abc' } })

describe('sessionMiddleware and viewerSession', () => {
  it('shares one session lookup across every call in a request', async () => {
    const calls = stubSessionApi()
    const req = request()
    const context = new RouterContextProvider()
    const results = await sessionMiddleware({ request: req, context }, () =>
      Promise.all([
        viewerSession({ request: req, context }),
        viewerSession({ request: req, context }),
        viewerSession({ request: req, context }),
      ]),
    )
    expect(calls).toEqual(['/v1/auth/session'])
    expect(results).toEqual([MEMBER, MEMBER, MEMBER])
  })

  it('asks for nothing when no route needs the session', async () => {
    const calls = stubSessionApi()
    const req = request()
    await sessionMiddleware(
      { request: req, context: new RouterContextProvider() },
      async () => 'ok',
    )
    expect(calls).toEqual([])
  })

  it('gives each request its own lookup', async () => {
    const calls = stubSessionApi()
    for (let i = 0; i < 2; i += 1) {
      const req = request()
      const context = new RouterContextProvider()
      await sessionMiddleware({ request: req, context }, () =>
        viewerSession({ request: req, context }),
      )
    }
    expect(calls).toEqual(['/v1/auth/session', '/v1/auth/session'])
  })

  it('loads the session directly when the middleware has not run', async () => {
    const calls = stubSessionApi()
    expect(await viewerSession({ request: request() })).toEqual(MEMBER)
    expect(
      await viewerSession({ request: request(), context: new RouterContextProvider() }),
    ).toEqual(MEMBER)
    expect(calls).toEqual(['/v1/auth/session', '/v1/auth/session'])
  })

  it('still degrades to a Visitor when the API is down', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('connection refused')
    })
    const req = request()
    const context = new RouterContextProvider()
    const session = await sessionMiddleware({ request: req, context }, () =>
      viewerSession({ request: req, context }),
    )
    expect(session).toEqual({ signupsOpen: false, viewer: null })
  })
})

describe('hasSessionCookie', () => {
  it.each([
    ['rp_session=abc', true],
    ['theme=light; rp_session=abc', true],
    ['theme=light;rp_session=abc;x=1', true],
    ['xrp_session=abc', false],
    ['rp_session_old=abc', false],
    ['theme=light', false],
    ['', false],
  ])('%s → %s', (cookie, expected) => {
    const req = new Request('https://reprint.test/', cookie ? { headers: { cookie } } : {})
    expect(hasSessionCookie(req)).toBe(expected)
  })
})
