import { afterEach, describe, expect, it, vi } from 'vitest'
import { loader } from './profile.js'

afterEach(() => vi.unstubAllGlobals())

const profile = {
  username: 'ada',
  displayName: 'Ada',
  bio: null,
  avatarUrl: null,
  joinedAt: '2026-01-01T00:00:00.000Z',
  reviewCount: 0,
  helpfulVotes: 0,
  libraryPublic: true,
  verified: true,
}
const reviews = { items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }

function stub(profileStatus = 200, reviewsStatus = 200) {
  const seen: string[] = []
  vi.stubGlobal('fetch', async (url: URL) => {
    const href = String(url)
    seen.push(href)
    if (href.includes('/reviews')) return Response.json(reviews, { status: reviewsStatus })
    return Response.json(profile, { status: profileStatus })
  })
  return seen
}

const load = (search = '', username = 'ada') =>
  loader({
    request: new Request(`https://reprint.test/u/${username}${search}`),
    params: { username },
  } as never)

describe('profile loader', () => {
  it('loads the profile and its reviews with a canonical URL', async () => {
    const seen = stub()
    const result = await load('?page=2')
    expect(seen.some((url) => url.includes('/v1/users/ada/reviews?page=2'))).toBe(true)
    expect(result.canonicalUrl).toBe('https://reprint.test/u/ada')
    expect(result.profile.username).toBe('ada')
  })

  it('falls back to page 1 for a bad page', async () => {
    const seen = stub()
    await load('?page=-3')
    expect(seen.some((url) => url.endsWith('/reviews?page=1'))).toBe(true)
  })

  it('renders the 404 page for an unknown or deleted username', async () => {
    stub(404, 404)
    const thrown = await load('', 'nobody').catch((error) => error)
    expect(thrown.init.status).toBe(404)
  })

  it('answers 502 when the API fails', async () => {
    stub(500)
    const thrown = await load().catch((error) => error)
    expect(thrown.init.status).toBe(502)
  })
})
