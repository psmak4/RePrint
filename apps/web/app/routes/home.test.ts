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
}

describe('home loader', () => {
  it('loads the Discover rows from the API', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      seen.push(String(url))
      return Response.json(rows)
    })
    const result = await loader({ request } as never)
    expect(seen[0]).toContain('/v1/discover')
    expect(result.discover.featuredGenres).toEqual([{ slug: 'fantasy', name: 'Fantasy' }])
  })

  it('renders without rows when the API fails', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 500 }))
    const result = await loader({ request } as never)
    expect(Object.values(result.discover).every((row) => row === null)).toBe(true)
  })
})
