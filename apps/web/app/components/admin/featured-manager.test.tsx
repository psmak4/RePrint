// @vitest-environment jsdom
import type { AdminFeatured, FeaturedReview } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { FeaturedManager } from './featured-manager.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const genre = (n: number) => ({ id: id(n), slug: `genre-${n}`, name: `Genre ${n}` })
const review = (n: number): FeaturedReview => ({
  review: {
    id: id(n),
    rating: 5,
    headline: `Headline ${n}`,
    body: `Body ${n}`,
    hasSpoilers: false,
    helpfulCount: 0,
    submittedAt: '2026-10-01T00:00:00.000Z',
    author: { username: `reader${n}`, displayName: `Reader ${n}` },
  },
  book: {
    id: id(n),
    slug: `book-${n}`,
    title: `Book ${n}`,
    subtitle: null,
    cover: null,
    firstPublishedYear: null,
    contributions: [],
    rating: { average: 5, count: 1 },
  } as never,
})

function renderManager(
  props: { canEditGenres?: boolean; featured?: Partial<AdminFeatured> } = {},
  action: (body: unknown) => unknown = () => ({ done: 'genresSaved' }),
) {
  const featured: AdminFeatured = {
    genres: [genre(1), genre(2)],
    genreOptions: [genre(1), genre(2), genre(3)],
    review: review(5),
    candidates: [review(5), review(6)],
    ...props.featured,
  }
  const Stub = createRoutesStub([
    {
      path: '/admin/featured',
      Component: () => (
        <FeaturedManager featured={featured} canEditGenres={props.canEditGenres ?? true} />
      ),
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/admin/featured']} />)
}

describe('FeaturedManager', () => {
  it('reorders, adds, and saves the featured Genres', async () => {
    const sent: unknown[] = []
    renderManager({}, (body) => {
      sent.push(body)
      return { done: 'genresSaved' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Move Genre 2 up' }))
    fireEvent.change(screen.getByLabelText('Add a Genre'), { target: { value: id(3) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Genre' }))
    const list = screen.getByRole('list', { name: 'Featured Genres' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Save featured Genres' }))
    await screen.findByText('The featured Genres were saved.')
    expect(sent).toEqual([{ genreIds: [id(2), id(1), id(3)] }])
  })

  it('is read-only for Genres without featured.genres', () => {
    renderManager({ canEditGenres: false })
    expect(screen.getByText('Only Admins can change the featured Genres.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save featured Genres' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Feature the review of Book 6' })).toBeTruthy()
  })

  it('features a review and clears it', async () => {
    const sent: unknown[] = []
    renderManager({}, (body) => {
      sent.push(body)
      return {
        done: (body as { reviewId: string | null }).reviewId ? 'reviewSaved' : 'reviewCleared',
      }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Feature the review of Book 6' }))
    await screen.findByText('The featured review was saved.')
    fireEvent.click(screen.getByRole('button', { name: 'Clear featured review' }))
    await waitFor(() => expect(screen.getByText('The featured review was cleared.')).toBeTruthy())
    expect(sent).toEqual([{ reviewId: id(6) }, { reviewId: null }])
  })

  it('shows a refusal from the API', async () => {
    renderManager({}, () => ({ formError: 'Only an Approved review can be featured.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Feature the review of Book 6' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Approved')
  })

  it('shows empty states', () => {
    renderManager({ featured: { genres: [], review: null, candidates: [] } })
    expect(screen.getByText('No Genres are featured.')).toBeTruthy()
    expect(screen.getByText('No review is featured.')).toBeTruthy()
    expect(screen.getByText('There are no Approved reviews to choose from yet.')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    const { container } = renderManager()
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
