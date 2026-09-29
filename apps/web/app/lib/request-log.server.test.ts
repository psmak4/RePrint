import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createApiClient } from './api.server.js'
import { createLogger } from './logger.server.js'
import { createRequestLogMiddleware } from './request-log.server.js'

function setup() {
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()))
      callback()
    },
  })
  return { lines, log: createLogger({ stream }) }
}

describe('request log middleware', () => {
  it('uses one request ID in the web log line and the API call for the same page view', async () => {
    const { lines, log } = setup()
    const sent: Headers[] = []
    const fetchStub = (async (_url: URL, init?: RequestInit) => {
      sent.push(new Headers(init?.headers))
      return new Response('{}')
    }) as unknown as typeof fetch
    const request = new Request('http://www.reprint.localhost:5173/', {
      headers: { cookie: 'rp_session=abc' },
    })

    const response = await createRequestLogMiddleware(log)({ request }, async () => {
      // A loader running inside the middleware chain.
      await createApiClient({ baseUrl: 'http://api.test', request, fetch: fetchStub }).get(
        '/v1/health',
      )
      return new Response('ok', { status: 200 })
    })

    const apiRequestId = sent[0]?.get('x-request-id')
    expect(apiRequestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(lines[0]).toMatchObject({ reqId: apiRequestId, method: 'GET', path: '/', status: 200 })
    expect((response as Response).headers.get('x-request-id')).toBe(apiRequestId)
    expect(JSON.stringify(lines)).not.toContain('rp_session')
  })

  it('keeps a valid incoming ID and replaces an unsafe one', async () => {
    const { lines, log } = setup()
    const middleware = createRequestLogMiddleware(log)
    const next = async () => new Response('ok')
    await middleware(
      { request: new Request('http://x/a', { headers: { 'x-request-id': 'req-1' } }) },
      next,
    )
    await middleware(
      { request: new Request('http://x/b', { headers: { 'x-request-id': 'bad id{}' } }) },
      next,
    )
    expect(lines[0]?.reqId).toBe('req-1')
    expect(lines[1]?.reqId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
