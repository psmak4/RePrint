import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadSession = vi.fn()
const postToApi = vi.fn()
vi.mock('../lib/auth.server.js', () => ({
  loadSession: (r: Request) => loadSession(r),
  postToApi: (...args: unknown[]) => postToApi(...args),
}))

import { metaArgs } from '../lib/seo.testing.js'
import { loader, meta } from './confirm-email-change.js'

const args = (query: string) => ({ request: new Request(`http://x/confirm${query}`) }) as never

beforeEach(() => {
  loadSession.mockReset().mockResolvedValue({ signupsOpen: false, viewer: null })
  postToApi.mockReset()
})

describe('confirm-email-change loader', () => {
  it('spends the token through the API', async () => {
    postToApi.mockResolvedValue({ ok: true })
    expect(await loader(args('?token=abc'))).toEqual({ changed: true, signedIn: false })
    expect(postToApi.mock.calls[0]?.slice(1, 3)).toEqual(['/v1/me/email/confirm', { token: 'abc' }])
  })

  it('fails without calling the API when the token is missing', async () => {
    expect(await loader(args(''))).toEqual({ changed: false, signedIn: false })
    expect(postToApi).not.toHaveBeenCalled()
  })

  it('fails when the API refuses the token', async () => {
    postToApi.mockResolvedValue({ ok: false })
    expect(await loader(args('?token=old'))).toEqual({ changed: false, signedIn: false })
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})
