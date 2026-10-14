import { afterEach, describe, expect, it, vi } from 'vitest'
import { action, loader, meta } from './book.js'

afterEach(() => vi.unstubAllGlobals())

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const rating = { average: null, count: 0, distribution: [0, 0, 0, 0, 0] }
const herbert = { id: id(9), slug: 'frank-herbert', name: 'Frank Herbert' }

const book = {
  id: id(1),
  slug: 'dune-abc123',
  title: 'Dune',
  subtitle: null,
  description: 'A desert planet.',
  firstPublishedYear: 1965,
  originalLanguage: 'en',
  primaryEditionId: null,
  cover: null,
  contributions: [{ author: herbert, role: 'author', position: 0 }],
  series: [],
  genres: [],
  primaryEdition: null,
  editionCount: 0,
  rating,
}

const summary = (n: number, slug: string) => ({
  id: id(n),
  slug,
  title: slug,
  subtitle: null,
  cover: null,
  firstPublishedYear: null,
  contributions: [],
  rating,
})

function respond(url: URL) {
  if (url.pathname === '/v1/books/dune-abc123') return Response.json(book)
  if (url.pathname === '/v1/books/dune-abc123/editions') return Response.json({ items: [] })
  if (url.pathname === '/v1/books/dune-abc123/reviews')
    return Response.json({ items: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } })
  if (url.pathname === '/v1/books/dune-abc123/related') {
    // The API leaves this Book out and sends at most 6 (M10-T06).
    return Response.json({
      author: {
        slug: herbert.slug,
        name: herbert.name,
        bio: null,
        birthDate: null,
        deathDate: null,
        photo: null,
        bookCount: 8,
        books: [2, 3, 4, 5, 6, 7].map((n) => summary(n, `other-${n}`)),
      },
      series: null,
      genre: null,
    })
  }
  return new Response(null, { status: 404 })
}

/** A Member's browser sends the session cookie; a Visitor's sends none. */
const MEMBER_COOKIE = { cookie: 'rp_session=abc' }

function load(
  handler: (url: URL) => Response | Promise<Response>,
  slug = 'dune-abc123',
  headers: Record<string, string> = {},
) {
  vi.stubGlobal('fetch', async (url: URL) => handler(new URL(String(url))))
  return loader({
    request: new Request(`https://reprint.test/books/${slug}`, { headers }),
    params: { slug },
  } as never)
}

describe('book loader reviews', () => {
  it('passes sort, rating, and page from the URL to the reviews API', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', async (url: URL) => {
      const u = new URL(String(url))
      if (u.pathname.endsWith('/reviews')) seen.push(u.search)
      return respond(u)
    })
    const result = await loader({
      request: new Request('https://reprint.test/books/dune-abc123?sort=newest&rating=4&page=2'),
      params: { slug: 'dune-abc123' },
    } as never)
    expect(seen).toEqual(['?sort=newest&page=2&rating=4'])
    expect(result.reviewQuery).toEqual({ sort: 'newest', rating: 4, page: 2 })
  })

  it('falls back to defaults for invalid params and survives a reviews failure', async () => {
    vi.stubGlobal('fetch', async (url: URL) => {
      const u = new URL(String(url))
      if (u.pathname.endsWith('/reviews')) return new Response(null, { status: 500 })
      return respond(u)
    })
    const result = await loader({
      request: new Request('https://reprint.test/books/dune-abc123?sort=bogus&rating=9'),
      params: { slug: 'dune-abc123' },
    } as never)
    expect(result.reviewQuery).toEqual({ sort: 'most_helpful', page: 1 })
    expect(result.reviews).toBeNull()
  })
})

describe('book loader side data', () => {
  const side = (url: URL) => {
    if (url.pathname === '/v1/books/dune-abc123/related')
      return Response.json({
        author: {
          slug: herbert.slug,
          name: herbert.name,
          bio: 'Wrote Dune.',
          birthDate: '1920-10-08',
          deathDate: '1986-02-11',
          photo: null,
          bookCount: 8,
          books: [summary(4, 'children')],
        },
        series: {
          slug: 'dune-saga',
          name: 'Dune Saga',
          memberCount: 6,
          total: 2,
          items: [
            { position: 1, book: summary(1, 'dune-abc123') },
            { position: 2.5, book: summary(2, 'messiah') },
          ],
        },
        genre: {
          slug: 'science-fiction',
          name: 'Science fiction',
          books: [summary(3, 'neuromancer')],
        },
      })
    return respond(url)
  }

  it('loads the Series, More in Genre, and Author card data from the one rails request', async () => {
    const result = await load(side)
    // "of 6" from the Source while 2 are stored (D-199).
    expect(result.series).toMatchObject({ name: 'Dune Saga', total: 6, stored: 2 })
    expect(result.series?.books.map((b) => b.position)).toEqual(['1', '2.5'])
    expect(result.moreInGenre).toMatchObject({
      genreName: 'Science fiction',
      genreSlug: 'science-fiction',
    })
    expect(result.moreInGenre?.books.map((b) => b.slug)).toEqual(['neuromancer'])
    expect(result.authorCard).toEqual({
      name: 'Frank Herbert',
      slug: 'frank-herbert',
      photo: null,
      born: '1920-10-08',
      died: '1986-02-11',
      bio: 'Wrote Dune.',
      bookCount: 8,
    })
    expect(result.moreByAuthor).toMatchObject({
      authorName: 'Frank Herbert',
      authorSlug: 'frank-herbert',
    })
  })

  it('still renders the Book when the rails request fails', async () => {
    const failing = (url: URL) =>
      url.pathname.endsWith('/related') ? new Response(null, { status: 500 }) : side(url)
    const result = await load(failing)
    expect(result.book.title).toBe('Dune')
    expect(result.series).toBeNull()
    expect(result.moreInGenre).toBeNull()
    expect(result.authorCard).toBeNull()
    expect(result.moreByAuthor).toBeNull()
  })

  it('shows no More by rail when the Author has no other Books, but keeps their card', async () => {
    const alone = (url: URL) =>
      url.pathname.endsWith('/related')
        ? Response.json({
            author: {
              slug: herbert.slug,
              name: herbert.name,
              bio: null,
              birthDate: null,
              deathDate: null,
              photo: null,
              bookCount: 1,
              books: [],
            },
            series: null,
            genre: null,
          })
        : respond(url)
    const result = await load(alone)
    expect(result.moreByAuthor).toBeNull()
    expect(result.authorCard?.bookCount).toBe(1)
  })
})

describe('book loader', () => {
  it('loads the Book, Editions, and up to 6 more Books by the author without this one', async () => {
    const result = await load(respond)
    expect(result.book.title).toBe('Dune')
    expect(result.moreByAuthor?.books).toHaveLength(6)
    expect(result.moreByAuthor?.books.map((b) => b.slug)).not.toContain('dune-abc123')
  })

  it('redirects the old slug of a merged Book to the remaining Book with a 301', async () => {
    const merged = (url: URL) =>
      url.pathname === '/v1/books/old-dune-000000' ? Response.json(book) : respond(url)
    const thrown = await load(merged, 'old-dune-000000').catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(Response)
    const response = thrown as Response
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe('/books/dune-abc123')
  })

  it('returns Book and BreadcrumbList JSON-LD with absolute URLs', async () => {
    const result = await load(respond)
    expect(result.jsonLd).toMatchObject([
      { '@type': 'Book', url: 'https://reprint.test/books/dune-abc123', name: 'Dune' },
      { '@type': 'BreadcrumbList' },
    ])
  })

  it('gives the canonical URL and meta description', async () => {
    const result = await load(respond)
    expect(result.canonicalUrl).toBe('https://reprint.test/books/dune-abc123')
    expect(result.metaDescription).toBe('A desert planet.')
    const tags = meta({ loaderData: result } as never)
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/books/dune-abc123',
    })
    expect(tags).toContainEqual({ name: 'description', content: 'A desert planet.' })
    expect(tags).toContainEqual({ property: 'og:title', content: 'Dune' })
    expect(tags).toContainEqual({ property: 'og:type', content: 'book' })
    expect(tags).toContainEqual({
      property: 'og:url',
      content: 'https://reprint.test/books/dune-abc123',
    })
  })

  it('builds a description when the Book has none and trims a long one', async () => {
    const none = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json({ ...book, description: null })
        : respond(url),
    )
    expect(none.metaDescription).toBe('Dune by Frank Herbert: ratings and reviews on RePrint.')
    const long = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json({ ...book, description: 'word '.repeat(100) })
        : respond(url),
    )
    expect(long.metaDescription.length).toBeLessThanOrEqual(160)
    expect(long.metaDescription.endsWith('…')).toBe(true)
  })

  it('gives the meta description and JSON-LD the text of a Markdown description (D-202)', async () => {
    const result = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json({
            ...book,
            description: 'A *desert* planet ([source][1]).\n\n[1]: https://example.org/dune',
          })
        : respond(url),
    )
    expect(result.metaDescription).toBe('A desert planet (source).')
    expect(result.jsonLd[0]).toMatchObject({ description: 'A desert planet (source).' })
  })

  it('still renders the Book when Editions and the author fail', async () => {
    const result = await load((url) =>
      url.pathname === '/v1/books/dune-abc123'
        ? Response.json(book)
        : new Response(null, { status: 500 }),
    )
    expect(result.editions).toEqual([])
    expect(result.moreByAuthor).toBeNull()
  })

  it('answers 404 for an unknown or malformed slug', async () => {
    const missing = await load(respond, 'nope-123').catch((thrown) => thrown)
    expect(missing.init.status).toBe(404)
    const bad = await load(respond, 'Not_A_Slug').catch((thrown) => thrown)
    expect(bad.init.status).toBe(404)
  })

  it('answers 502 when the API is down', async () => {
    const down = await load(() => {
      throw new Error('down')
    }).catch((thrown) => thrown)
    expect(down.init.status).toBe(502)
  })
})

describe('book loader for Members', () => {
  const viewer = { id: id(5), username: 'ada', displayName: 'Ada', verified: true, permissions: [] }
  const mine = {
    id: id(6),
    rating: 5,
    headline: null,
    body: 'x'.repeat(60),
    hasSpoilers: false,
    editionId: null,
    status: 'pending',
    rejectionReason: null,
    submittedAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }

  it('loads the viewer and their review', async () => {
    const result = await load(
      (url) => {
        if (url.pathname === '/v1/auth/session')
          return Response.json({ signupsOpen: false, viewer })
        if (url.pathname === '/v1/books/dune-abc123/my-review') return Response.json(mine)
        return respond(url)
      },
      'dune-abc123',
      MEMBER_COOKIE,
    )
    expect(result.viewer?.username).toBe('ada')
    expect(result.myReview?.status).toBe('pending')
  })

  it('loads the review IDs the Member marked helpful, and none for a Visitor', async () => {
    const member = await load(
      (url) => {
        if (url.pathname === '/v1/auth/session')
          return Response.json({ signupsOpen: false, viewer })
        if (url.pathname === '/v1/books/dune-abc123/helpful-votes')
          return Response.json({ reviewIds: [id(7)] })
        return respond(url)
      },
      'dune-abc123',
      MEMBER_COOKIE,
    )
    expect(member.votedReviewIds).toEqual([id(7)])
    expect((await load(respond)).votedReviewIds).toEqual([])
  })

  it('has no review for a Member who has not written one, or for a Visitor', async () => {
    const member = await load(
      (url) =>
        url.pathname === '/v1/auth/session'
          ? Response.json({ signupsOpen: false, viewer })
          : respond(url),
      'dune-abc123',
      MEMBER_COOKIE,
    )
    expect(member.viewer).not.toBeNull()
    expect(member.myReview).toBeNull()
    const visitor = await load(respond)
    expect(visitor.viewer).toBeNull()
    expect(visitor.myReview).toBeNull()
  })
})

describe('book loader request rounds (M10-T03)', () => {
  const viewer = { id: id(5), username: 'ada', displayName: 'Ada', verified: true, permissions: [] }

  it('asks for everything, the rails included, before the Book answers (M10-T06)', async () => {
    const seen: string[] = []
    let answerBook: () => void = () => {}
    const bookAnswered = new Promise<void>((resolve) => (answerBook = resolve))
    const pending = load(
      async (url) => {
        seen.push(url.pathname)
        if (url.pathname === '/v1/books/dune-abc123') {
          await bookAnswered
          return Response.json(book)
        }
        if (url.pathname === '/v1/auth/session')
          return Response.json({ signupsOpen: false, viewer })
        return respond(url)
      },
      'dune-abc123',
      MEMBER_COOKIE,
    )
    await vi.waitFor(() => expect(seen).toHaveLength(7))
    expect(new Set(seen)).toEqual(
      new Set([
        '/v1/books/dune-abc123',
        '/v1/books/dune-abc123/editions',
        '/v1/books/dune-abc123/reviews',
        '/v1/auth/session',
        '/v1/books/dune-abc123/my-review',
        '/v1/books/dune-abc123/helpful-votes',
        '/v1/books/dune-abc123/related',
      ]),
    )
    answerBook()
    const result = await pending
    // Nothing waited for the Book: no request went out after it answered.
    expect(seen).toHaveLength(7)
    expect(result.viewer?.username).toBe('ada')
    expect(result.moreByAuthor?.books).toHaveLength(6)
  })

  it('asks nothing about the viewer’s review without a session cookie', async () => {
    const seen: string[] = []
    const result = await load((url) => {
      seen.push(url.pathname)
      return respond(url)
    })
    expect(seen).not.toContain('/v1/books/dune-abc123/my-review')
    expect(seen).not.toContain('/v1/books/dune-abc123/helpful-votes')
    expect(result.viewer).toBeNull()
  })

  it('shows no review parts when the cookie no longer signs anyone in', async () => {
    const result = await load(
      (url) => {
        if (url.pathname === '/v1/books/dune-abc123/my-review')
          return Response.json({ id: id(6) }, { status: 401 })
        if (url.pathname === '/v1/books/dune-abc123/helpful-votes')
          return Response.json({ reviewIds: [id(7)] })
        return respond(url)
      },
      'dune-abc123',
      MEMBER_COOKIE,
    )
    expect(result.viewer).toBeNull()
    expect(result.myReview).toBeNull()
    expect(result.votedReviewIds).toEqual([])
  })

  it('redirects a merged Book’s old slug, dropping what was asked under it', async () => {
    const seen: string[] = []
    const merged = (url: URL) => {
      seen.push(url.pathname)
      return url.pathname === '/v1/books/old-dune-000000' ? Response.json(book) : respond(url)
    }
    vi.stubGlobal('fetch', async (url: URL) => merged(new URL(String(url))))
    const thrown = await loader({
      request: new Request('https://reprint.test/books/old-dune-000000?sort=newest'),
      params: { slug: 'old-dune-000000' },
    } as never).catch((error: unknown) => error)
    expect((thrown as Response).status).toBe(301)
    expect((thrown as Response).headers.get('Location')).toBe('/books/dune-abc123?sort=newest')
    expect(
      seen.every(
        (path) => path.startsWith('/v1/books/old-dune-000000') || path === '/v1/auth/session',
      ),
    ).toBe(true)
  })
})

describe('book action', () => {
  const calls: { method: string; url: string; body: unknown }[] = []
  function act(body: unknown, reply: () => Response) {
    calls.length = 0
    vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
      calls.push({
        method: init.method ?? 'GET',
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : null,
      })
      return reply()
    })
    return action({
      request: new Request('https://reprint.test/books/dune-abc123', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params: { slug: 'dune-abc123' },
    } as never)
  }
  const input = { intent: 'save', rating: 5, body: 'y'.repeat(60), hasSpoilers: false }

  it('saves a review with PUT and no intent field', async () => {
    const result = await act(input, () => Response.json({}, { status: 201 }))
    expect(result).toEqual({ saved: true })
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toContain('/v1/books/dune-abc123/my-review')
    expect(calls[0]?.body).toEqual({ rating: 5, body: 'y'.repeat(60), hasSpoilers: false })
  })

  it('passes API field errors back to the form', async () => {
    const result = (await act(input, () =>
      Response.json(
        {
          type: 'about:blank',
          title: 'Bad',
          status: 400,
          detail: 'Bad',
          errors: [{ path: 'body.editionId', message: 'Pick an Edition of this Book.' }],
        },
        { status: 400 },
      ),
    )) as { data: unknown; init: { status: number } }
    expect(result.init.status).toBe(400)
    expect(result.data).toEqual({ fieldErrors: { editionId: 'Pick an Edition of this Book.' } })
  })

  it('deletes with DELETE', async () => {
    const result = await act({ intent: 'delete' }, () =>
      Response.json({ status: 'review_deleted' }),
    )
    expect(result).toEqual({ deleted: true })
    expect(calls[0]?.method).toBe('DELETE')
  })

  it('rejects a body that is not a valid review', async () => {
    const result = (await act({ intent: 'save', rating: 9 }, () => Response.json({}))) as {
      init: { status: number }
    }
    expect(result.init.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})
