// @vitest-environment jsdom
import type { BookSummary, DiscoverResponse, Viewer } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { DiscoverPage } from './discover-page.js'

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

function renderPage(discover: DiscoverResponse, who: Viewer | null = null) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <DiscoverPage discover={discover} viewer={who} /> },
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
      'Featured review',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    expect(screen.getByRole('link', { name: 'Recent1' }).getAttribute('href')).toBe(
      '/books/recent1-abc1',
    )
    expect(screen.getByRole('link', { name: 'Fantasy' }).getAttribute('href')).toBe(
      '/genres/fantasy',
    )
    expect(screen.getByRole('link', { name: 'All genres' }).getAttribute('href')).toBe('/genres')
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
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([])
  })

  it('shows sign-in prompts to Visitors and not to Members', () => {
    renderPage(full)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeTruthy()
    cleanup()
    renderPage(full, viewer)
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create an account' })).toBeNull()
  })
})
