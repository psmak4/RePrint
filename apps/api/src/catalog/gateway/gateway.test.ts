import type { Redis } from 'ioredis'
import { describe, expect, it, vi } from 'vitest'
import { SourceError } from '../sources/types.js'
import { createSourceGateway } from './gateway.js'

/** A minimal Redis double: the limiter script always grants a slot, and counters are ignored. */
function fakeRedis(): Redis {
  return {
    eval: async () => 0,
    zrem: async () => 0,
    multi: () => ({ incr: () => ({ expire: () => ({ exec: async () => [] }) }) }),
    hincrby: async () => 1,
  } as unknown as Redis
}

function setup(transport: typeof fetch) {
  return createSourceGateway({
    redis: fakeRedis(),
    rps: 2,
    timeoutMs: 1000,
    version: '1.2.3',
    contactEmail: 'ops@reprint.com',
    failureThreshold: 2,
    fetch: transport,
  })
}

describe('source gateway', () => {
  it('sends the RePrint User-Agent and a timeout signal', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('{}'))
    await setup(transport).fetch('https://example.test/a', {
      headers: { Accept: 'application/json' },
    })
    const init = transport.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('User-Agent')).toBe('RePrint/1.2.3 (ops@reprint.com)')
    expect(headers.get('Accept')).toBe('application/json')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('opens the breaker after repeated 5xx answers and then rejects without calling the Source', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }))
    const gateway = setup(transport)
    await gateway.fetch('https://example.test/a')
    await gateway.fetch('https://example.test/a')
    await expect(gateway.fetch('https://example.test/a')).rejects.toBeInstanceOf(SourceError)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('does not count a 404 as a failure', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('no', { status: 404 }))
    const gateway = setup(transport)
    for (let i = 0; i < 4; i += 1) await gateway.fetch('https://example.test/a')
    expect(gateway.breaker.state).toBe('closed')
  })

  it('counts a network error as a failure and rethrows it', async () => {
    const transport = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const gateway = setup(transport)
    await expect(gateway.fetch('https://example.test/a')).rejects.toThrow('fetch failed')
    await expect(gateway.fetch('https://example.test/a')).rejects.toThrow('fetch failed')
    expect(gateway.breaker.state).toBe('open')
  })
})
