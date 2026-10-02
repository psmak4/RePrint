// @vitest-environment jsdom
import type { BookSummary, GenreDetailResponse, SeriesDetailResponse } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { GenrePage, GenresIndexPage, genreHref } from './genre-pages.js'
import { SeriesPage } from './series-page.js'

afterEach(cleanup)

const seriousViolations = (results: axe.AxeResults) =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const herbert = { id: id(9), slug: 'frank-herbert', name: 'Frank Herbert' }

const summary = (n: number, title: string, count: number, average: number | null) =>
  ({
    id: id(n),
    slug: `${title.toLowerCase()}-abc12${n}`,
    title,
    subtitle: null,
    cover: null,
    firstPublishedYear: 1965,
    contributions: [{ author: herbert, role: 'author', position: 0 }],
    rating: { average, count, distribution: [0, 0, 0, 0, 0] },
  }) satisfies BookSummary

function renderInRouter(ui: React.ReactNode) {
  const Stub = createRoutesStub([{ path: '/', Component: () => ui }])
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub />
    </QueryClientProvider>,
  )
}

const detail: GenreDetailResponse = {
  genre: { slug: 'science-fiction', name: 'Science Fiction', description: 'Futures.' },
  parent: { slug: 'fiction', name: 'Fiction' },
  children: [{ slug: 'space-opera', name: 'Space Opera' }],
  items: [summary(1, 'Dune', 12, 4.5), summary(2, 'Hyperion', 0, null)],
  page: 2,
  pageSize: 20,
  hasMore: true,
}

describe('GenresIndexPage', () => {
  it('lists every Genre with children nested, and has no axe violations', async () => {
    const { container } = renderInRouter(
      <GenresIndexPage
        items={[
          {
            slug: 'fiction',
            name: 'Fiction',
            description: null,
            featured: false,
            children: [
              {
                slug: 'fantasy',
                name: 'Fantasy',
                description: 'Magic.',
                featured: false,
                children: [],
              },
            ],
          },
          { slug: 'history', name: 'History', description: null, featured: true, children: [] },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Fiction' }).getAttribute('href')).toBe(
      '/genres/fiction',
    )
    expect(screen.getByRole('link', { name: 'Fantasy' }).getAttribute('href')).toBe(
      '/genres/fantasy',
    )
    expect(screen.getByRole('link', { name: 'History' })).toBeTruthy()
    expect(seriousViolations(await axe.run(container))).toEqual([])
  })

  it('says so when there are no Genres', () => {
    renderInRouter(<GenresIndexPage items={[]} />)
    expect(screen.getByText('No genres yet')).toBeTruthy()
  })
})

describe('GenrePage', () => {
  it('shows Books with ratings, sort links that carry the sort in the URL, and paging', async () => {
    const { container } = renderInRouter(<GenrePage detail={detail} sort="most_reviewed" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Science Fiction' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Fiction' }).getAttribute('href')).toBe(
      '/genres/fiction',
    )
    expect(screen.getByRole('link', { name: 'Space Opera' }).getAttribute('href')).toBe(
      '/genres/space-opera',
    )
    expect(screen.getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe(
      '/books/dune-abc121',
    )
    expect(screen.getByText(/Rated 4\.5 out of 5 from 12 reviews/)).toBeTruthy()

    const sorts = within(screen.getByRole('navigation', { name: 'Sort by' }))
    expect(sorts.getByRole('link', { name: 'Top rated' }).getAttribute('href')).toBe(
      '/genres/science-fiction',
    )
    expect(sorts.getByRole('link', { name: 'Newest review' }).getAttribute('href')).toBe(
      '/genres/science-fiction?sort=newest_review',
    )
    expect(sorts.getByRole('link', { name: 'Most reviewed' }).getAttribute('aria-current')).toBe(
      'true',
    )

    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/genres/science-fiction?sort=most_reviewed',
    )
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/genres/science-fiction?sort=most_reviewed&page=3',
    )
    expect(seriousViolations(await axe.run(container))).toEqual([])
  })

  it('links a top-level Genre back to the index and hides paging on a single page', () => {
    renderInRouter(
      <GenrePage
        detail={{ ...detail, parent: null, children: [], items: [], page: 1, hasMore: false }}
        sort="top_rated"
      />,
    )
    expect(screen.getByRole('link', { name: 'All genres' }).getAttribute('href')).toBe('/genres')
    expect(screen.getByText('No books in this genre yet')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull()
  })

  it('builds Genre URLs without defaults', () => {
    expect(genreHref('a', 'top_rated', 1)).toBe('/genres/a')
    expect(genreHref('a', 'newest_review', 2)).toBe('/genres/a?sort=newest_review&page=2')
  })
})

describe('SeriesPage', () => {
  const series: SeriesDetailResponse = {
    series: { slug: 'dune-chronicles', name: 'Dune Chronicles', description: 'Six novels.' },
    items: [
      { position: 1, book: summary(1, 'Dune', 12, 4.5) },
      { position: 2.5, book: summary(2, 'Interlude', 1, 3) },
      { position: null, book: summary(3, 'Extra', 0, null) },
    ],
  }

  it('lists Books in order with positions and ratings, and has no axe violations', async () => {
    const { container } = renderInRouter(<SeriesPage detail={series} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dune Chronicles' })).toBeTruthy()
    const entries = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(entries.map((li) => li.querySelector('h3')?.textContent)).toEqual([
      'Dune',
      'Interlude',
      'Extra',
    ])
    expect(within(entries[0] as HTMLElement).getByText('Book 1')).toBeTruthy()
    expect(within(entries[1] as HTMLElement).getByText('Book 2.5')).toBeTruthy()
    expect(within(entries[2] as HTMLElement).getByText('Not numbered')).toBeTruthy()
    expect(screen.getByText(/Rated 4\.5 out of 5 from 12 reviews/)).toBeTruthy()
    expect(seriousViolations(await axe.run(container))).toEqual([])
  })

  it('says so when the Series has no Books', () => {
    renderInRouter(<SeriesPage detail={{ ...series, items: [] }} />)
    expect(screen.getByText('No books in this series yet')).toBeTruthy()
  })
})
