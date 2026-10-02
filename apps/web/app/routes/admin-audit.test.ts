import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { loader, meta } from './admin-audit.js'
import { loader as csvLoader } from './admin-audit-csv.js'

const viewerWith = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'a', displayName: 'A', verified: true, permissions },
})

beforeEach(() => {
  loadSession.mockReset()
  loadSession.mockResolvedValue(viewerWith(['audit.view']))
})
afterEach(() => vi.unstubAllGlobals())

const args = (search = '', path = 'audit') =>
  ({ request: new Request(`https://reprint.test/admin/${path}${search}`) }) as never

function stubApi(status = 200, body: unknown = { items: [], meta: { nextCursor: null } }) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    const u = new URL(String(url))
    calls.push(u.pathname + u.search)
    return typeof body === 'string'
      ? new Response(body, { status, headers: { 'content-type': 'text/csv' } })
      : Response.json(body, { status })
  })
  return calls
}

const thrown = (run: () => unknown) =>
  Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)

describe('admin audit loader', () => {
  it('passes the filters from the URL to the API and back to the page', async () => {
    const calls = stubApi()
    const result = (await loader(
      args('?actor=ada&action=role.grant&targetType=user&from=2026-01-01&cursor=abc'),
    )) as { filters: Record<string, string> }
    const url = new URL(`https://x${calls[0]}`)
    expect(url.pathname).toBe('/v1/admin/audit')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '25',
      actor: 'ada',
      action: 'role.grant',
      targetType: 'user',
      from: '2026-01-01',
      cursor: 'abc',
    })
    expect(result.filters).toMatchObject({ actor: 'ada', action: 'role.grant' })
  })

  it('drops empty and invalid filters instead of failing', async () => {
    const calls = stubApi()
    await loader(args('?actor=&action=nuke&from=yesterday'))
    expect(calls[0]).toBe('/v1/admin/audit?limit=25')
  })

  it('refuses a Moderator without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
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
    expect(meta()).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})

describe('admin audit CSV resource route', () => {
  it('forwards the filters and the download headers', async () => {
    const calls = stubApi(200, 'id\r\n')
    const response = (await csvLoader(args('?action=role.grant&bogus=1', 'audit.csv'))) as Response
    expect(calls[0]).toBe('/v1/admin/audit.csv?action=role.grant')
    expect(response.headers.get('content-type')).toBe('text/csv')
    expect(await response.text()).toBe('id\r\n')
  })

  it('refuses a Moderator without calling the API', async () => {
    loadSession.mockResolvedValue(viewerWith(['users.view']))
    const calls = stubApi()
    const error = (await thrown(() => csvLoader(args('', 'audit.csv')))) as {
      init?: { status?: number }
    }
    expect(error.init?.status).toBe(403)
    expect(calls).toEqual([])
  })
})
