import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api.server.js'

function setup(headers: Record<string, string>) {
  const fetchMock = vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) => new Response('{}'),
  )
  const client = createApiClient({
    baseUrl: 'http://api.internal:3000',
    request: new Request('http://www.reprint.test/', { headers }),
    fetch: fetchMock,
  })
  return { client, fetchMock }
}

describe('createApiClient', () => {
  it('forwards the incoming cookie and x-request-id', async () => {
    const { client, fetchMock } = setup({ cookie: 'rp_session=abc', 'x-request-id': 'req-1' })
    await client.get('/v1/health')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('http://api.internal:3000/v1/health')
    const headers = new Headers(init?.headers)
    expect(headers.get('cookie')).toBe('rp_session=abc')
    expect(headers.get('x-request-id')).toBe('req-1')
    expect(init?.method).toBe('GET')
  })

  it('generates a request ID and omits cookie when the request has none', async () => {
    const { client, fetchMock } = setup({})
    await client.get('/v1/health')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('lets a call override forwarded headers', async () => {
    const { client, fetchMock } = setup({ 'x-request-id': 'req-1' })
    await client.request('/v1/x', { method: 'POST', headers: { 'x-request-id': 'other' } })
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('x-request-id')).toBe('other')
    expect(init?.method).toBe('POST')
  })
})
