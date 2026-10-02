import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('../lib/api.server.js', () => ({ apiClientFor: () => ({ get }) }))

import { loader } from './settings-export.js'

const args = { request: new Request('http://localhost/settings/export') } as never

beforeEach(() => get.mockReset())

describe('settings/export loader', () => {
  it('passes the download and its headers through', async () => {
    get.mockResolvedValue(
      new Response('{"ok":true}', {
        headers: {
          'content-type': 'application/json',
          'content-disposition': 'attachment; filename="x.json"',
          'cache-control': 'no-store',
          'set-cookie': 'a=b',
        },
      }),
    )
    const response = (await loader(args)) as Response
    expect(get).toHaveBeenCalledWith('/v1/me/export')
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('set-cookie')).toBe(false)
    expect(await response.text()).toBe('{"ok":true}')
  })

  it('sends a Visitor to /login', async () => {
    get.mockResolvedValue(new Response(null, { status: 401 }))
    const thrown = await Promise.resolve(loader(args)).catch((error) => error)
    expect(thrown.status).toBe(302)
    expect(thrown.headers.get('location')).toBe('/login')
  })

  it('answers 502 when the API fails', async () => {
    get.mockResolvedValue(new Response(null, { status: 500 }))
    const thrown = await Promise.resolve(loader(args)).catch((error) => error)
    expect(thrown.status).toBe(502)
  })
})
