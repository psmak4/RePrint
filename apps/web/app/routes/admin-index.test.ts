import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './admin-index.js'

const args = { request: new Request('https://reprint.test/admin') } as never
const viewer = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})
const stats = {
  pendingCount: 3,
  oldestPendingAt: '2026-10-01T00:00:00.000Z',
  oldestPendingAgeSeconds: 7200,
  openReportCount: 0,
  oldestOpenReportAt: null,
  oldestOpenReportAgeSeconds: null,
}

beforeEach(() => loadSession.mockReset())
afterEach(() => vi.unstubAllGlobals())

async function thrown(run: () => unknown) {
  return Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
}

describe('admin dashboard loader', () => {
  it('loads the stats for a Moderator', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async (url: URL) =>
      new URL(String(url)).pathname === '/v1/mod/stats'
        ? Response.json(stats)
        : Response.json({ items: [], meta: { nextCursor: null } }),
    )
    const result = (await loader(args)) as { stats: unknown }
    expect(result.stats).toEqual(stats)
  })

  it('loads the three oldest pending reviews beside the stats', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    const requests: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      const target = new URL(String(url))
      requests.push(`${target.pathname}${target.search}`)
      return target.pathname === '/v1/mod/stats'
        ? Response.json(stats)
        : Response.json({ items: [], meta: { nextCursor: null } })
    })
    const result = await loader(args)
    expect(requests.sort()).toEqual(['/v1/mod/reviews?limit=3', '/v1/mod/stats'])
    expect(result.oldest).toEqual([])
  })

  it('still renders the stats when the queue request fails', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async (url: URL) =>
      new URL(String(url)).pathname === '/v1/mod/stats'
        ? Response.json(stats)
        : new Response('down', { status: 503 }),
    )
    const result = await loader(args)
    expect(result.stats.pendingCount).toBe(3)
    expect(result.oldest).toBeNull()
  })

  it('refuses a Member without calling the API', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.write']))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const error = (await thrown(() => loader(args))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('redirects Visitors to /login', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const error = (await thrown(() => loader(args))) as Response
    expect(error.status).toBe(302)
    expect(error.headers.get('location')).toBe('/login')
  })

  it('answers 502 when the stats cannot be loaded', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }))
    const error = (await thrown(() => loader(args))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(502)
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})
