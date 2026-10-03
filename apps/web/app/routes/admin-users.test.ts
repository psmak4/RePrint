import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './admin-users.js'

const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(['users.view', 'audit.view']))
})
afterEach(() => vi.unstubAllGlobals())

const args = (search = '') =>
  ({ request: new Request(`https://reprint.test/admin/users${search}`) }) as never

function stubApi(status = 200, body: unknown = { items: [], meta: { nextCursor: null } }) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    const u = new URL(String(url))
    calls.push(u.pathname + u.search)
    return Response.json(body, { status })
  })
  return calls
}

const thrown = (run: () => unknown) =>
  Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)

describe('admin users loader', () => {
  it('passes the filters from the URL to the API and back to the page', async () => {
    const calls = stubApi()
    const result = (await loader(
      args('?q=ada&role=moderator&status=suspended&joinedFrom=2026-01-01&cursor=abc'),
    )) as { filters: Record<string, string>; canSearchEmail: boolean }
    const url = new URL(`https://x${calls[0]}`)
    expect(url.pathname).toBe('/v1/admin/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '25',
      q: 'ada',
      role: 'moderator',
      status: 'suspended',
      joinedFrom: '2026-01-01',
      cursor: 'abc',
    })
    expect(result.filters).toMatchObject({ q: 'ada', role: 'moderator', status: 'suspended' })
    expect(result.canSearchEmail).toBe(true)
  })

  it('drops empty and invalid filters instead of failing', async () => {
    const calls = stubApi()
    await loader(args('?q=&role=wizard&joinedFrom=yesterday'))
    expect(calls[0]).toBe('/v1/admin/users?limit=25')
  })

  it('gives Moderators the limited search', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    stubApi()
    const result = (await loader(args())) as { canSearchEmail: boolean }
    expect(result.canSearchEmail).toBe(false)
  })

  it('refuses a Member without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['reviews.write']))
    const calls = stubApi()
    const error = (await thrown(() => loader(args()))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('redirects Visitors to /login', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const error = (await thrown(() => loader(args()))) as Response
    expect(error.headers.get('location')).toBe('/login')
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})
