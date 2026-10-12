import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth.server.js')>()),
  loadSession: (r: Request) => loadSession(r),
}))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './admin.js'

const args = { request: new Request('https://reprint.test/admin/reviews') } as never
const viewer = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})
const stats = {
  pendingCount: 3,
  oldestPendingAt: '2026-10-01T00:00:00.000Z',
  oldestPendingAgeSeconds: 7200,
  openReportCount: 1,
  oldestOpenReportAt: '2026-10-01T00:00:00.000Z',
  oldestOpenReportAgeSeconds: 7200,
}

beforeEach(() => loadSession.mockReset())
afterEach(() => vi.unstubAllGlobals())

async function thrown(run: () => unknown) {
  return Promise.resolve()
    .then(run)
    .catch((e: unknown) => e)
}

describe('admin layout loader', () => {
  it('redirects Visitors to /login', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const error = (await thrown(() => loader(args))) as Response
    expect(error.status).toBe(302)
    expect(error.headers.get('location')).toBe('/login')
  })

  it('answers 403 to a Member without admin permissions', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.write']))
    const error = (await thrown(() => loader(args))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
  })

  it('groups the queues for a Moderator and adds the counts', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate', 'reports.resolve']))
    const paths: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      paths.push(new URL(String(url)).pathname)
      return Response.json(stats)
    })
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Moderation',
          items: [
            { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
            { to: '/admin/reviews', label: 'Review queue', icon: 'reviews', count: 3 },
            { to: '/admin/reports', label: 'Reports queue', icon: 'reports', count: 1 },
          ],
        },
      ],
    })
    expect(paths).toEqual(['/v1/mod/stats'])
  })

  it('never asks for the counts without reviews.moderate', async () => {
    loadSession.mockResolvedValue(viewer(['reports.resolve']))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Moderation',
          items: [{ to: '/admin/reports', label: 'Reports queue', icon: 'reports' }],
        },
      ],
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves the counts off when the stats request fails', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }))
    const { groups } = await loader(args)
    expect(groups[0]?.items.every((item) => item.count === undefined)).toBe(true)
  })

  it('leaves the counts off when the stats request throws', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    vi.stubGlobal('fetch', async () => {
      throw new Error('connect ECONNREFUSED')
    })
    const { groups } = await loader(args)
    expect(groups[0]?.items.map((item) => item.count)).toEqual([undefined, undefined])
  })

  it('lists People for users.view and audit.view', async () => {
    loadSession.mockResolvedValue(viewer(['users.view', 'audit.view']))
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'People',
          items: [
            { to: '/admin/users', label: 'Users', icon: 'users' },
            { to: '/admin/audit', label: 'Audit log', icon: 'audit' },
          ],
        },
      ],
    })
  })

  it('opens the area for audit.view alone and lists only the audit log', async () => {
    loadSession.mockResolvedValue(viewer(['audit.view']))
    expect(await loader(args)).toEqual({
      groups: [
        { label: 'People', items: [{ to: '/admin/audit', label: 'Audit log', icon: 'audit' }] },
      ],
    })
  })

  it('lists Catalog and Operations for catalog.manage and featured.manage', async () => {
    loadSession.mockResolvedValue(viewer(['catalog.manage', 'featured.manage']))
    expect(await loader(args)).toEqual({
      groups: [
        {
          label: 'Catalog',
          items: [
            { to: '/admin/catalog', label: 'Catalog', icon: 'catalog' },
            { to: '/admin/catalog/merge', label: 'Merge queue', icon: 'merge' },
            { to: '/admin/catalog/genres', label: 'Genres and rules', icon: 'genres' },
            { to: '/admin/featured', label: 'Featured content', icon: 'featured' },
          ],
        },
        {
          label: 'Operations',
          items: [{ to: '/admin/system', label: 'System', icon: 'system' }],
        },
      ],
    })
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})
