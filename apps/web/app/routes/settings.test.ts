import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
vi.mock('../lib/auth.server.js', () => ({ loadSession: (r: Request) => loadSession(r) }))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './settings.js'
import { meta as profileMeta } from './settings-profile.js'

const args = { request: new Request('http://localhost/settings/profile') } as never

beforeEach(() => loadSession.mockReset())

describe('settings loader', () => {
  it('redirects Visitors to /login', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: null })
    const thrown = await Promise.resolve(loader(args)).catch((e: Response) => e)
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('location')).toBe('/login')
  })

  it('lets a signed-in Member through', async () => {
    loadSession.mockResolvedValue({ signupsOpen: false, viewer: { id: 'x' } })
    expect(await loader(args)).toBeNull()
  })
})

describe('settings meta', () => {
  it.each([meta, profileMeta])('marks the page noindex', (fn) => {
    expect(fn(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})
