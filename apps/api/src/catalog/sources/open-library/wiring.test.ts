import { describe, expect, it, vi } from 'vitest'
import { createSourceAdapter } from '../index.js'
import { createFixtureFetch } from './fixture-fetch.js'
import { openLibraryImplementations } from './index.js'

const config = { fetch: fetch }

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

  it('sends live requests through the gateway fetch it is given', async () => {
    const gatewayFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ numFound: 0, docs: [] })),
    )
    await createSourceAdapter(
      'live',
      openLibraryImplementations({ fetch: gatewayFetch }),
    ).searchBooks('dune', 1)
    expect(gatewayFetch).toHaveBeenCalledTimes(1)
  })
})
