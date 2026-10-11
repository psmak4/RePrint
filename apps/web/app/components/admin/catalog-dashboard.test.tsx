// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDashboard, type CatalogSearch } from './catalog-dashboard.js'

afterEach(cleanup)

const stats = {
  totals: { books: 12_345, editions: 20_000, authors: 900 },
  monthly: [
    { month: '2026-09', books: 10, editions: 15, authors: 4 },
    { month: '2026-10', books: 0, editions: 0, authors: 0 },
  ],
}

function renderDashboard(value = stats, search?: CatalogSearch) {
  const Stub = createRoutesStub([
    {
      path: '/admin/catalog',
      Component: () => <CatalogDashboard stats={value} search={search} />,
    },
  ])
  return render(<Stub initialEntries={['/admin/catalog']} />)
}

const book = (n: number) => ({
  id: `0192a3b4-0000-7000-8000-00000000000${n}`,
  slug: `dune-${n}`,
  title: n === 1 ? 'Dune' : `Dune ${n}`,
  subtitle: null,
  cover: null,
  firstPublishedYear: 1965,
  contributions: [
    {
      author: {
        id: '0192a3b4-0000-7000-8000-0000000000aa',
        slug: 'frank-herbert',
        name: 'Frank Herbert',
      },
      role: 'author' as const,
      position: 0,
    },
  ],
  rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
})

describe('CatalogDashboard', () => {
  it('shows the Catalog size and monthly growth', () => {
    renderDashboard()
    expect(screen.getByText('12,345')).toBeTruthy()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).getByText('Sep 2026')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('15')).toBeTruthy()
  })

  it('says so when nothing was added', () => {
    renderDashboard({
      ...stats,
      monthly: [{ month: '2026-10', books: 0, editions: 0, authors: 0 }],
    })
    expect(screen.getByText('Nothing was added in the last 12 months.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('links each found Book to its admin page and its public page', () => {
    renderDashboard(stats, {
      q: 'dune',
      page: 1,
      results: { items: [book(1)], page: 1, hasMore: false },
    })
    const list = screen.getByRole('list', { name: 'Books matching “dune”' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    const item = items[0] as HTMLElement
    expect(within(item).getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe(
      '/admin/books/0192a3b4-0000-7000-8000-000000000001',
    )
    expect(within(item).getByRole('link', { name: 'Public page' }).getAttribute('href')).toBe(
      '/books/dune-1',
    )
    expect(within(item).getByText('Frank Herbert · 1965')).toBeTruthy()
    expect((screen.getByLabelText('Title, Author, or ISBN') as HTMLInputElement).value).toBe('dune')
    expect(screen.queryByRole('navigation', { name: 'Search result pages' })).toBeNull()
  })

  it('pages through results, keeping the query', () => {
    renderDashboard(stats, {
      q: 'dune',
      page: 2,
      results: { items: [book(2)], page: 2, hasMore: true },
    })
    const pager = screen.getByRole('navigation', { name: 'Search result pages' })
    expect(within(pager).getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/admin/catalog?q=dune',
    )
    expect(within(pager).getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/admin/catalog?q=dune&page=3',
    )
    expect(within(pager).getByText('Page 2')).toBeTruthy()
  })

  it('says when nothing matches, when the query is too short, and when the search failed', () => {
    renderDashboard(stats, { q: 'zzz', page: 1, results: { items: [], page: 1, hasMore: false } })
    expect(screen.getByText('No Books on RePrint match “zzz”.')).toBeTruthy()
    cleanup()
    renderDashboard(stats, { q: 'd', page: 1, results: { items: [], page: 1, hasMore: false } })
    expect(screen.getByText('Type at least 2 characters to search.')).toBeTruthy()
    cleanup()
    renderDashboard(stats, { q: 'dune', page: 1, results: 'failed' })
    expect(screen.getByRole('alert').textContent).toBe(
      'We could not search the Catalog. Please try again in a moment.',
    )
    expect(screen.getByText('12,345')).toBeTruthy()
  })

  it('has no serious or critical axe issues with results', async () => {
    const { container } = renderDashboard(stats, {
      q: 'dune',
      page: 2,
      results: { items: [book(1), book(2)], page: 2, hasMore: true },
    })
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderDashboard()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
