// @vitest-environment jsdom
import type { BookSummary, DiscoverResponse, LibraryEntry, Viewer } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { DiscoverPage, type YourReading } from './discover-page.js'

afterEach(cleanup)

const seriousViolations = (results: axe.AxeResults) =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

const id = (n: number) => `0192a3b4-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`
const herbert = { id: id(99), slug: 'frank-herbert', name: 'Frank Herbert' }

const summary = (n: number, title: string) =>
  ({
    id: id(n),
    slug: `${title.toLowerCase()}-abc${n}`,
    title,
    subtitle: null,
    cover: null,
    firstPublishedYear: 1965,
    contributions: [{ author: herbert, role: 'author', position: 0 }],
    rating: { average: 4.5, count: 12, distribution: [0, 0, 0, 6, 6] },
  }) satisfies BookSummary

const books = (prefix: string) =>
  Array.from({ length: 6 }, (_, i) => summary(i + 1, `${prefix}${i + 1}`))

const empty: DiscoverResponse = {
  recentlyReviewed: null,
  topRated: null,
  mostReviewedThisMonth: null,
  featuredGenres: null,
  featuredReview: null,
  justApproved: null,
}

const full: DiscoverResponse = {
  recentlyReviewed: books('Recent'),
  topRated: books('Top'),
  mostReviewedThisMonth: books('Month').map((book) => ({ ...book, recentReviewCount: 4 })),
  featuredGenres: [
    { slug: 'science-fiction', name: 'Science Fiction' },
    { slug: 'fantasy', name: 'Fantasy' },
  ],
  featuredReview: {
    review: {
      id: id(50),
      rating: 5,
      headline: 'A masterpiece',
      body: 'Spice, sand, and politics.',
      hasSpoilers: false,
      helpfulCount: 3,
      submittedAt: '2026-09-01T00:00:00.000Z',
      author: { username: 'member1', displayName: 'Member One' },
    },
    book: summary(60, 'Dune'),
  },
  justApproved: null,
}

const viewer = { username: 'member1', verified: true } as unknown as Viewer

function renderPage(
  discover: DiscoverResponse,
  who: Viewer | null = null,
  reading: YourReading | null = null,
) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => <DiscoverPage discover={discover} viewer={who} reading={reading} />,
    },
  ])
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub />
    </QueryClientProvider>,
  )
}

describe('DiscoverPage', () => {
  it('renders every row, the genre grid with an all-genres link, and the featured review', async () => {
    const { container } = renderPage(full)
    for (const name of [
      'Recently reviewed',
      'Top rated on RePrint',
      'Most reviewed this month',
      'Browse by genre',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Recent1' }).getAttribute('href')).toBe(
      '/books/recent1-abc1',
    )
    expect(
      screen.getAllByRole('link', { name: 'Fantasy' }).map((link) => link.getAttribute('href')),
    ).toEqual(['/genres/fantasy', '/genres/fantasy'])
    expect(screen.getByRole('link', { name: 'All genres' }).getAttribute('href')).toBe('/genres')
    expect(screen.getByRole('heading', { level: 2, name: 'Featured review' })).toBeTruthy()
    expect(screen.getByText('Spice, sand, and politics.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe(
      '/books/dune-abc60',
    )
    expect(seriousViolations(await axe.run(container))).toEqual([])
  })

  it('leaves no heading for a hidden row', () => {
    renderPage({ ...full, topRated: null, featuredReview: null })
    expect(screen.queryByRole('heading', { name: 'Top rated on RePrint' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Featured review' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Recently reviewed' })).toBeTruthy()
  })

  it('says so when every row is hidden', () => {
    renderPage(empty)
    expect(screen.getByText(/Nothing to show here yet/)).toBeTruthy()
    // Only the fixed sections remain: the Visitor pitch and "How a review gets here".
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Keep track of what you read',
      'How a review gets here',
    ])
  })

  it('shows the sign-up pitch to Visitors only', () => {
    renderPage(full)
    expect(screen.getByRole('link', { name: 'Create a free account' }).getAttribute('href')).toBe(
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
    cleanup()
    renderPage(full, viewer)
    expect(screen.queryByRole('link', { name: 'Create a free account' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Keep track of what you read' })).toBeNull()
  })

  it('shows Your reading only to a Member with a Reading or Want to Read entry', () => {
    const entry = (shelf: LibraryEntry['shelf'], n: number): LibraryEntry => ({
      shelf,
      addedAt: '2026-09-01T00:00:00.000Z',
      book: summary(n, `Shelved${n}`),
    })
    renderPage(full, viewer, {
      reading: [entry('reading', 70)],
      wantToRead: [entry('want_to_read', 71)],
    })
    const strip = screen.getByRole('region', { name: 'Your reading' })
    expect(within(strip).getByRole('link', { name: 'Shelved70' })).toBeTruthy()
    expect(within(strip).getByRole('link', { name: 'Shelved71' })).toBeTruthy()
    expect(within(strip).getByRole('link', { name: 'Write a review' }).getAttribute('href')).toBe(
      '/u/member1/library?shelf=read',
    )
    cleanup()
    renderPage(full, viewer, { reading: [], wantToRead: [] })
    expect(screen.queryByRole('heading', { name: 'Your reading' })).toBeNull()
    cleanup()
    renderPage(full, null, { reading: [entry('reading', 70)], wantToRead: [] })
    expect(screen.queryByRole('heading', { name: 'Your reading' })).toBeNull()
  })

  it('shows monthly review counts and Just approved excerpts', () => {
    renderPage({
      ...full,
      justApproved: [1, 2, 3].map((n) => ({
        review: {
          id: id(80 + n),
          rating: 4,
          headline: null,
          excerpt: `Excerpt number ${n}`,
          author: { username: 'member1', displayName: 'Member One' },
        },
        book: summary(n, `Approved${n}`),
      })) as unknown as DiscoverResponse['justApproved'],
    })
    expect(screen.getAllByText('4 new reviews').length).toBe(6)
    expect(screen.getByRole('heading', { level: 2, name: 'Just approved' })).toBeTruthy()
    expect(screen.getByText('Excerpt number 2')).toBeTruthy()
  })
})
