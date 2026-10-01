import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', () => ({ loadSession: (r: Request) => loadSession(r) }))

import { loader, meta } from './admin.js'
import { loader as indexLoader } from './admin-index.js'

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
      items: [{ to: '/admin/reviews', label: 'Review queue' }],
    })
  })

  it('opens the area for other admin permissions but lists no queue link', async () => {
    loadSession.mockResolvedValue(viewer(['users.view']))
    expect(await loader(args)).toEqual({ items: [] })
  })

  it('is noindex', () => {
    expect(meta()).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})

describe('admin index loader', () => {
  it('sends a Moderator to the review queue', async () => {
    loadSession.mockResolvedValue(viewer(['reviews.moderate']))
    const error = (await thrown(() => indexLoader(args))) as Response
    expect(error.status).toBe(302)
    expect(error.headers.get('location')).toBe('/admin/reviews')
  })

  it('refuses a Member', async () => {
    loadSession.mockResolvedValue(viewer([]))
    const error = (await thrown(() => indexLoader(args))) as { init?: { status?: number } }
    expect(error.init?.status).toBe(403)
  })
})
