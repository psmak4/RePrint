// @vitest-environment jsdom
import type { SearchQuery, SearchResponse } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { SearchResultsPage } from './search-results-page.js'

afterEach(() => {
  cleanup()
  window.plausible = undefined
})

const query: SearchQuery = { q: 'dune', type: 'books', sort: 'relevance', page: 1 }
const ID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'

const base: SearchResponse = {
  items: [
    {
      kind: 'book',
      book: {
        id: ID,
        slug: 'dune',
        title: 'Dune',
        subtitle: null,
        cover: null,
        firstPublishedYear: 1965,
        contributions: [
          {
            role: 'author',
            author: { id: ID, slug: 'frank-herbert', name: 'Frank Herbert' },
          },
        ],
        rating: { average: 4.3, count: 12 },
      },
    },
    {
      kind: 'candidate',
      candidate: {
        ref: 'ref-1-abcdefghijklmnopqrstu',
        title: 'Dune Messiah',
        subtitle: null,
        cover: null,
        firstPublishedYear: 1969,
        contributions: [{ authorName: 'Frank Herbert', role: 'author' }],
      },
    },
  ],
  isbnMatch: null,
  page: 1,
  pageSize: 20,
  hasMore: false,
  sourceUnavailable: false,
} as never

function renderPage(props: Partial<Parameters<typeof SearchResultsPage>[0]> = {}) {
  const Stub = createRoutesStub([
    {
      path: '/search',
      Component: () => <SearchResultsPage query={query} results={base} failed={false} {...props} />,
    },
  ])
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub initialEntries={['/search?q=dune']} />
    </QueryClientProvider>,
  )
}

describe('SearchResultsPage', () => {
  it('shows Books and Authors tabs with the current one marked', () => {
    renderPage()
    const tabs = within(screen.getByRole('navigation', { name: copy.search.tabsLabel }))
    expect(tabs.getByRole('link', { name: 'Books' }).getAttribute('aria-current')).toBe('page')
    expect(tabs.getByRole('link', { name: 'Authors' }).getAttribute('href')).toBe(
      '/search?q=dune&type=authors',
    )
  })

  it('keeps filters, sort, and page in the URL: the form is a plain GET', () => {
    renderPage({
      query: { ...query, decade: 1960, sort: 'newest', page: 2 },
      results: { ...base, hasMore: true },
    })
    const form = screen.getByRole('form', { name: copy.search.filtersLabel })
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/search')
    expect((screen.getByLabelText(copy.search.decade) as HTMLSelectElement).value).toBe('1960')
    expect((screen.getByLabelText(copy.search.sort) as HTMLSelectElement).value).toBe('newest')
    const pages = within(screen.getByRole('navigation', { name: copy.search.pagesLabel }))
    expect(pages.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/search?q=dune&decade=1960&sort=newest',
    )
    expect(pages.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/search?q=dune&decade=1960&sort=newest&page=3',
    )
  })

  it('links stored Books to their page and unstored ones to the resolve flow', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe('/books/dune')
    expect(screen.getByRole('link', { name: 'Dune Messiah' }).getAttribute('href')).toBe(
      '/resolve?ref=ref-1-abcdefghijklmnopqrstu',
    )
    expect(screen.getByText(copy.books.noReviews)).toBeTruthy()
  })

  it('tracks a click on a result, stored or not', () => {
    const tracker = vi.fn()
    window.plausible = tracker
    renderPage()
    expect(tracker).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Dune' }))
    expect(tracker).toHaveBeenCalledWith('Search Result Click', undefined)
  })

  it('notes when the Source was unavailable', () => {
    renderPage({ results: { ...base, sourceUnavailable: true } })
    expect(screen.getByText(copy.search.sourceUnavailable)).toBeTruthy()
  })

  it('lists Authors on the Authors tab without Book filters', () => {
    renderPage({
      query: { ...query, type: 'authors' },
      results: {
        ...base,
        items: [
          { kind: 'author', author: { id: ID, slug: 'frank-herbert', name: 'Frank Herbert' } },
        ],
      },
    })
    expect(screen.getByRole('link', { name: 'Frank Herbert' }).getAttribute('href')).toBe(
      '/authors/frank-herbert',
    )
    expect(screen.queryByRole('form', { name: copy.search.filtersLabel })).toBeNull()
  })

  it('has a Genre select filled from the Genre tree that keeps the choice from the URL', () => {
    const genres = [
      {
        slug: 'fiction',
        name: 'Fiction',
        description: null,
        featured: true,
        children: [
          {
            slug: 'science-fiction',
            name: 'Science Fiction',
            description: null,
            featured: false,
            children: [],
          },
        ],
      },
    ]
    renderPage({ query: { ...query, genre: 'science-fiction' }, genres })
    const select = screen.getByLabelText(copy.search.genre) as HTMLSelectElement
    expect(select.name).toBe('genre')
    expect(select.value).toBe('science-fiction')
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([copy.search.anyOption, 'Fiction', '– Science Fiction'])
    expect(screen.queryByRole('link', { name: /remove genre/i })).toBeNull()
    expect(screen.getByText(copy.search.catalogOnly)).toBeTruthy()
  })

  it('defaults the Genre select to Any and hides it on the Authors tab', () => {
    renderPage()
    expect((screen.getByLabelText(copy.search.genre) as HTMLSelectElement).value).toBe('')
    cleanup()
    renderPage({ query: { ...query, type: 'authors' } })
    expect(screen.queryByLabelText(copy.search.genre)).toBeNull()
  })

  it('shows the empty, prompt, and failure states', () => {
    renderPage({ results: { ...base, items: [] } })
    expect(screen.getByText(copy.search.empty)).toBeTruthy()
    cleanup()
    renderPage({ query: { ...query, q: '' }, results: null })
    expect(screen.getByText(copy.search.prompt)).toBeTruthy()
    cleanup()
    renderPage({ results: null, failed: true })
    expect(screen.getByRole('alert').textContent).toBe(copy.search.loadFailed)
  })
})
