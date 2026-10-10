import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './home.js'

afterEach(() => vi.unstubAllGlobals())

const request = new Request('https://reprint.test/')
const rows = {
  recentlyReviewed: null,
  topRated: null,
  mostReviewedThisMonth: null,
  featuredGenres: [{ slug: 'fantasy', name: 'Fantasy' }],
  featuredReview: null,
  justApproved: null,
}

describe('home loader', () => {
  it('loads the Discover rows from the API', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      seen.push(String(url))
      return Response.json(rows)
    })
    const result = await loader({ request } as never)
    expect(seen.some((url) => url.includes('/v1/discover'))).toBe(true)
    expect(result.discover.featuredGenres).toEqual([{ slug: 'fantasy', name: 'Fantasy' }])
  })

  it('loads the Reading and Want to Read Shelves for a signed-in Member', async () => {
    const viewer = {
      id: '0192a3b4-0000-7000-8000-000000000001',
      username: 'member1',
      displayName: 'Member One',
      verified: true,
      permissions: [],
    }
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      const href = String(url)
      seen.push(href)
      if (href.includes('/auth/session')) return Response.json({ signupsOpen: true, viewer })
      if (href.includes('/library')) {
        return Response.json({
          items: [],
          meta: { page: 1, pageSize: 4, total: 0, totalPages: 0 },
          counts: { all: 0, want_to_read: 0, reading: 0, read: 0 },
        })
      }
      return Response.json(rows)
    })
    const result = await loader({ request } as never)
    expect(result.reading).toEqual({ reading: [], wantToRead: [] })
    expect(seen.some((url) => url.includes('shelf=reading'))).toBe(true)
    expect(seen.some((url) => url.includes('shelf=want_to_read'))).toBe(true)
  })

  it('has no Your reading data for a Visitor', async () => {
    vi.stubGlobal('fetch', async () => Response.json(rows))
    expect((await loader({ request } as never)).reading).toBeNull()
  })

  it('renders without rows when the API fails', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }))
    const result = await loader({ request } as never)
    expect(Object.values(result.discover).every((row) => row === null)).toBe(true)
  })
})
