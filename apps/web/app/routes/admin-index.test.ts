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
    const paths: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      paths.push(new URL(String(url)).pathname)
      return Response.json(stats)
    })
    const result = (await loader(args)) as { stats: unknown }
    expect(result.stats).toEqual(stats)
    expect(paths).toEqual(['/v1/mod/stats'])
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
