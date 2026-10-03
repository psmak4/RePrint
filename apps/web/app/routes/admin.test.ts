import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', () => ({ loadSession: (r: Request) => loadSession(r) }))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './admin.js'

const args = { request: new Request('https://reprint.test/admin/reviews') } as never
const viewer = (permissions: string[]) => ({
  signupsOpen: false,
  viewer: { id: 'x', username: 'm', displayName: 'M', verified: true, permissions },
})

beforeEach(() => loadSession.mockReset())

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

  it('lists the review queue for a Moderator', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    expect(await loader(args)).toEqual({
      items: [
        { to: '/admin', label: 'Dashboard' },
        { to: '/admin/reviews', label: 'Review queue' },
      ],
    })
  })

  it('lists the reports queue for a holder of reports.resolve', async () => {
    loadSession.mockResolvedValue(viewer(['reports.resolve']))
    expect(await loader(args)).toEqual({
      items: [{ to: '/admin/reports', label: 'Reports queue' }],
    })
  })

  it('lists the Users link for users.view and no queue links', async () => {
    loadSession.mockResolvedValue(viewer(['users.view']))
    expect(await loader(args)).toEqual({ items: [{ to: '/admin/users', label: 'Users' }] })
  })

  it('opens the area for audit.view alone and lists only the audit log', async () => {
    loadSession.mockResolvedValue(viewer(['audit.view']))
    expect(await loader(args)).toEqual({
      items: [{ to: '/admin/audit', label: 'Audit log' }],
    })
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })

  it('lists the Catalog sections for a holder of catalog.manage', async () => {
    loadSession.mockResolvedValue(viewer(['catalog.manage']))
    expect(await loader(args)).toEqual({
      items: [
        { to: '/admin/catalog', label: 'Catalog' },
        { to: '/admin/catalog/merge', label: 'Merge queue' },
        { to: '/admin/catalog/genres', label: 'Genres and rules' },
      ],
    })
  })
})
