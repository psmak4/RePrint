import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendToApi = vi.fn()
const get = vi.fn()
vi.mock('../lib/auth.server.js', () => ({
  sendToApi: (...args: unknown[]) => sendToApi(...args),
  failed: (result: { failure: unknown; status: number }) => ({ failure: result.failure }),
  forwardCookies: (from: Response, to: Headers) => {
    for (const cookie of from.headers.getSetCookie()) to.append('set-cookie', cookie)
  },
}))
vi.mock('../lib/api.server.js', () => ({ apiClientFor: () => ({ get }) }))
vi.mock('../lib/me.server.js', () => ({ loadMe: () => ({ id: 'me' }) }))

import { metaArgs } from '../lib/seo.testing.js'
import { action, loader, meta } from './settings-security.js'

const post = (body: unknown) =>
  ({
    request: new Request('http://localhost/settings/security', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  }) as never

const ok = (headers?: Headers) => ({
  ok: true,
  body: null,
  response: new Response(null, { headers }),
})

beforeEach(() => {
  sendToApi.mockReset()
  get.mockReset()
})

describe('settings/security loader', () => {
  it('redirects a Visitor to /login', async () => {
    get.mockResolvedValue(new Response(null, { status: 401 }))
    const thrown = await Promise.resolve(
      loader({ request: new Request('http://x/') } as never),
    ).catch((e: Response) => e)
    expect((thrown as Response).headers.get('location')).toBe('/login')
  })

  it('returns the account and its sessions', async () => {
    get.mockResolvedValue(Response.json({ items: [] }))
    expect(await loader({ request: new Request('http://x/') } as never)).toEqual({
      me: { id: 'me' },
      sessions: [],
    })
  })

  it('is noindex', () => {
    expect(meta(metaArgs() as never)).toContainEqual({ name: 'robots', content: 'noindex' })
  })
})

describe('settings/security action', () => {
  it('refuses an unknown intent', async () => {
    const result = (await action(post({ intent: 'nope' }))) as { init: { status: number } }
    expect(result.init.status).toBe(400)
    expect(sendToApi).not.toHaveBeenCalled()
  })

  it('starts an email change and reports the pending address', async () => {
    sendToApi.mockResolvedValue(ok())
    const result = await action(
      post({ intent: 'change-email', newEmail: 'new@example.com', currentPassword: 'pw' }),
    )
    expect(sendToApi.mock.calls[0]?.slice(1, 4)).toEqual([
      'POST',
      '/v1/me/email',
      { newEmail: 'new@example.com', currentPassword: 'pw' },
    ])
    expect(result).toEqual({ pendingEmail: 'new@example.com' })
  })

  it('passes API failures back to the form', async () => {
    sendToApi.mockResolvedValue({
      ok: false,
      status: 400,
      failure: { fieldErrors: { currentPassword: 'Wrong.' } },
    })
    const result = await action(
      post({
        intent: 'change-password',
        currentPassword: 'x',
        newPassword: 'a long enough password',
      }),
    )
    expect(result).toEqual({ failure: { fieldErrors: { currentPassword: 'Wrong.' } } })
  })

  it('ending another session stays on the page', async () => {
    sendToApi.mockResolvedValue(ok())
    const id = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a02'
    expect(await action(post({ intent: 'end-session', id }))).toEqual({ ended: id })
    expect(sendToApi.mock.calls[0]?.slice(1, 3)).toEqual(['DELETE', `/v1/me/sessions/${id}`])
  })

  it('ending the current session forwards the cleared cookie and leaves', async () => {
    sendToApi.mockResolvedValue(ok(new Headers({ 'set-cookie': 'rp_session=; Max-Age=0' })))
    const response = (await action(
      post({ intent: 'end-session', id: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a01' }),
    )) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('set-cookie')).toContain('rp_session=')
  })

  it.each([
    ['logout-all', {}, '/login', 'POST', '/v1/auth/logout-all'],
    ['delete-account', { password: 'pw' }, '/', 'DELETE', '/v1/me'],
  ])('%s forwards the cookie and redirects', async (intent, extra, to, method, path) => {
    sendToApi.mockResolvedValue(ok(new Headers({ 'set-cookie': 'rp_session=; Max-Age=0' })))
    const response = (await action(post({ intent, ...extra }))) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(to)
    expect(response.headers.get('set-cookie')).toContain('rp_session=')
    expect(sendToApi.mock.calls[0]?.slice(1, 3)).toEqual([method, path])
  })
})
