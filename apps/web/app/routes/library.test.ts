import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './library.js'

afterEach(() => vi.unstubAllGlobals())

const library = {
  items: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  counts: { all: 0, want_to_read: 0, reading: 0, read: 0 },
}

function stub(handler: () => Response) {
  const seen: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    seen.push(String(url))
    return handler()
  })
  return seen
}

const load = (search = '', username = 'ada') =>
  loader({
    request: new Request(`https://reprint.test/u/${username}/library${search}`),
    params: { username },
  } as never)

describe('library loader', () => {
  it('passes the Shelf, sort, and page from the URL to the API', async () => {
    const seen = stub(() => Response.json(library))
    const result = await load('?shelf=reading&sort=title&page=2')
    expect(seen[0]).toContain('/v1/users/ada/library?sort=title&page=2&shelf=reading')
    expect(result).toMatchObject({
      username: 'ada',
      view: { shelf: 'reading', sort: 'title', page: 2 },
    })
  })

  it('falls back to the defaults for bad values', async () => {
    const seen = stub(() => Response.json(library))
    await load('?shelf=nope&sort=zzz&page=-4')
    expect(seen[0]).toContain('sort=added_desc&page=1')
    expect(seen[0]).not.toContain('shelf=')
  })

  it('returns a 404 private state when the API answers 404', async () => {
    stub(() => new Response(null, { status: 404 }))
    const result = (await load()) as unknown as {
      data: { library: null }
      init: { status: number }
    }
    expect(result.data.library).toBeNull()
    expect(result.init.status).toBe(404)
  })

  it('answers 502 when the API fails', async () => {
    stub(() => new Response(null, { status: 500 }))
    const thrown = await load().catch((error) => error)
    expect(thrown.init.status).toBe(502)
  })
})
