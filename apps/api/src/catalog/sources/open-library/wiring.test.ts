import { describe, expect, it, vi } from 'vitest'
import { createSourceAdapter } from '../index.js'
import { createFixtureFetch } from './fixture-fetch.js'
import { openLibraryImplementations } from './index.js'

const config = { contactEmail: 'ops@reprint.test', version: '1.2.3', timeoutMs: 1000 }

describe('Open Library wiring', () => {
  it('serves fixtures mode from the recorded responses', async () => {
    const adapter = createSourceAdapter('fixtures', openLibraryImplementations(config))
    expect(adapter.name).toBe('open_library')
    expect((await adapter.searchBooks('ursula le guin', 1)).candidates.length).toBeGreaterThan(0)
  })

  it('answers 404 for a request that was never recorded', async () => {
    const response = await createFixtureFetch()('https://openlibrary.org/search.json?q=unrecorded')
    expect(response.status).toBe(404)
  })

  it('sends the RePrint User-Agent and a timeout in live mode', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ numFound: 0, docs: [] })))
    await createSourceAdapter('live', openLibraryImplementations(config)).searchBooks('dune', 1)
    const init = fetchSpy.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('User-Agent')).toBe('RePrint/1.2.3 (ops@reprint.test)')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    fetchSpy.mockRestore()
  })
})
