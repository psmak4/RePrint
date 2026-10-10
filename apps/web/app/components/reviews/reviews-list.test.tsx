// @vitest-environment jsdom
import type { BookReviewsResponse, PublicReview } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReviewListQuery } from '../../lib/review-links.js'
import { RatingSummary } from './rating-summary.js'
import { ReviewsList } from './reviews-list.js'

afterEach(cleanup)

const id = '0192a3b4-0000-7000-8000-000000000001'
const review = (over: Partial<PublicReview> = {}): PublicReview => ({
  id,
  rating: 4,
  headline: 'Worth it',
  body: 'First paragraph with https://example.com in it.\n\nSecond paragraph.',
  hasSpoilers: false,
  helpfulCount: 0,
  submittedAt: '2026-09-01T12:00:00.000Z',
  author: { username: 'ada', displayName: 'Ada' },
  ...over,
})
const page = (items: PublicReview[], totalPages = 1): BookReviewsResponse => ({
  items,
  meta: { page: 1, pageSize: 10, total: items.length, totalPages },
})
const base: ReviewListQuery = { sort: 'most_helpful', page: 1 }

function renderInRouter(node: React.ReactNode) {
  const Stub = createRoutesStub([
    {
      path: '/books/:slug',
      Component: () => <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
    },
  ])
  return render(<Stub initialEntries={['/books/dune']} />)
}

describe('RatingSummary', () => {
  const rating = { average: 4.2, count: 10, distribution: [0, 1, 2, 3, 4] }

  it('shows one-decimal average, count, and five bars with a text alternative', () => {
    renderInRouter(<RatingSummary slug="dune" rating={rating} query={base} />)
    expect(screen.getByText('4.2')).toBeTruthy()
    expect(screen.getByText('10 reviews')).toBeTruthy()
    expect(
      screen.getByText(/5 stars: 4, 4 stars: 3, 3 stars: 2, 2 stars: 1, 1 stars: 0/),
    ).toBeTruthy()
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('links each bar to the filtered list, and the active bar clears it', () => {
    renderInRouter(<RatingSummary slug="dune" rating={rating} query={base} />)
    expect(screen.getByRole('link', { name: /^5 stars: 4 reviews/ }).getAttribute('href')).toBe(
      '/books/dune?rating=5#reviews',
    )
    cleanup()
    renderInRouter(
      <RatingSummary slug="dune" rating={rating} query={{ ...base, rating: 5, page: 3 }} />,
    )
    const active = screen.getByRole('link', { name: /5 stars: 4 reviews \(filter on\)/ })
    expect(active.getAttribute('href')).toBe('/books/dune#reviews')
    expect(active.getAttribute('aria-current')).toBe('true')
  })

  it('renders nothing before the first review', () => {
    const { container } = renderInRouter(
      <RatingSummary
        slug="dune"
        rating={{ average: null, count: 0, distribution: [0, 0, 0, 0, 0] }}
        query={base}
      />,
    )
    expect(container.textContent).toBe('')
  })

  it('has no axe violations', async () => {
    const { container } = renderInRouter(<RatingSummary slug="dune" rating={rating} query={base} />)
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})

describe('ReviewsList', () => {
  it('renders paragraphs and keeps links as plain text', () => {
    const { container } = renderInRouter(
      <ReviewsList slug="dune" reviews={page([review()])} query={base} hasAnyReviews />,
    )
    expect(container.querySelectorAll('li p.whitespace-pre-line')).toHaveLength(2)
    expect(screen.getByText(/https:\/\/example\.com/)).toBeTruthy()
    expect(container.querySelector('a[href^="https://example.com"]')).toBeNull()
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeTruthy()
  })

  it('hides spoiler text until the toggle is opened', () => {
    renderInRouter(
      <ReviewsList
        slug="dune"
        reviews={page([review({ hasSpoilers: true, body: 'The butler did it.' })])}
        query={base}
        hasAnyReviews
      />,
    )
    expect(screen.queryByText('The butler did it.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show spoilers' }))
    expect(screen.getByText('The butler did it.')).toBeTruthy()
  })

  it('shows helpful counts only when there are votes', () => {
    renderInRouter(
      <ReviewsList
        slug="dune"
        reviews={page([review({ helpfulCount: 1 })])}
        query={base}
        hasAnyReviews
      />,
    )
    expect(screen.getByText('1 person found this helpful')).toBeTruthy()
  })

  it('offers sort and filter by URL params and pages with prev/next links', () => {
    renderInRouter(
      <ReviewsList
        slug="dune"
        reviews={page([review()], 3)}
        query={{ sort: 'newest', rating: 4, page: 2 }}
        hasAnyReviews
      />,
    )
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('newest')
    const chips = within(screen.getByRole('navigation', { name: 'Filter by rating' }))
    expect(chips.getByRole('link', { name: '4 stars only' }).getAttribute('aria-current')).toBe(
      'true',
    )
    expect(chips.getByRole('link', { name: '5 stars only' }).getAttribute('href')).toBe(
      '/books/dune?sort=newest&rating=5#reviews',
    )
    expect(chips.getByRole('link', { name: 'All ratings' }).getAttribute('href')).toBe(
      '/books/dune?sort=newest#reviews',
    )
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/books/dune?sort=newest&rating=4#reviews',
    )
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/books/dune?sort=newest&rating=4&page=3#reviews',
    )
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
  })

  it('shows empty and error states', () => {
    renderInRouter(
      <ReviewsList slug="dune" reviews={page([])} query={base} hasAnyReviews={false} />,
    )
    expect(screen.getByText(/No reviews yet/)).toBeTruthy()
    cleanup()
    renderInRouter(
      <ReviewsList slug="dune" reviews={page([])} query={{ ...base, rating: 2 }} hasAnyReviews />,
    )
    expect(screen.getByText('No reviews with this rating.')).toBeTruthy()
    cleanup()
    renderInRouter(<ReviewsList slug="dune" reviews={null} query={base} hasAnyReviews />)
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't load reviews/)
  })

  it('has no axe violations', async () => {
    const { container } = renderInRouter(
      <ReviewsList slug="dune" reviews={page([review()], 2)} query={base} hasAnyReviews />,
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
