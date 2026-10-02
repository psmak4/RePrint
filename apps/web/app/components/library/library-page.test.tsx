// @vitest-environment jsdom
import type { LibraryResponse } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { libraryHref } from '../../lib/library-links.js'
import { LibraryPage, PrivateLibrary } from './library-page.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const entry = (n: number, title: string, shelf: 'reading' | 'read' | 'want_to_read') => ({
  shelf,
  addedAt: '2026-09-01T00:00:00.000Z',
  book: {
    id: id(n),
    slug: `${title.toLowerCase()}-abc12${n}`,
    title,
    subtitle: null,
    cover: null,
    firstPublishedYear: 1965,
    contributions: [],
    rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
  },
})
const library: LibraryResponse = {
  items: [entry(1, 'Dune', 'reading'), entry(2, 'Hyperion', 'read')],
  meta: { page: 2, pageSize: 20, total: 45, totalPages: 3 },
  counts: { all: 45, want_to_read: 10, reading: 5, read: 30 },
}
const view = { shelf: 'reading' as const, sort: 'title' as const, page: 2 }
const owner = { id: id(8), username: 'Ada', displayName: 'Ada', verified: true, permissions: [] }

function renderPage(ui: React.ReactNode) {
  const Stub = createRoutesStub([{ path: '/', Component: () => ui }])
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub />
    </QueryClientProvider>,
  )
}

describe('LibraryPage', () => {
  it('shows tabs with counts, the current tab, and links that keep the sort', async () => {
    renderPage(<LibraryPage username="ada" library={library} view={view} viewer={null} />)
    const tabs = await screen.findByRole('navigation', { name: 'Shelves' })
    expect(within(tabs).getByRole('link', { name: 'All (45)' }).getAttribute('href')).toBe(
      '/u/ada/library?sort=title',
    )
    expect(within(tabs).getByRole('link', { name: 'Want to Read (10)' }).getAttribute('href')).toBe(
      '/u/ada/library?shelf=want_to_read&sort=title',
    )
    expect(
      within(tabs).getByRole('link', { name: 'Reading (5)' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveProperty('value', 'title')
  })

  it('pages through the URL', async () => {
    renderPage(<LibraryPage username="ada" library={library} view={view} />)
    expect((await screen.findByRole('link', { name: 'Previous' })).getAttribute('href')).toBe(
      '/u/ada/library?shelf=reading&sort=title',
    )
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/u/ada/library?shelf=reading&sort=title&page=3',
    )
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()
  })

  it('gives only the owner a shelf selector on each card', async () => {
    const { unmount } = renderPage(
      <LibraryPage username="ada" library={library} view={view} viewer={owner} />,
    )
    const selector = await screen.findByRole('combobox', { name: 'Shelf for Dune' })
    expect(selector).toHaveProperty('value', 'reading')
    expect(screen.getByRole('combobox', { name: 'Shelf for Hyperion' })).toHaveProperty(
      'value',
      'read',
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your library')
    unmount()

    renderPage(
      <LibraryPage
        username="ada"
        library={library}
        view={view}
        viewer={{ ...owner, username: 'bob' }}
      />,
    )
    await screen.findByRole('heading', { level: 1, name: "ada's library" })
    expect(screen.queryByRole('combobox', { name: /Shelf for/ })).toBeNull()
  })

  it('shows an empty state with a link to Discover', async () => {
    renderPage(
      <LibraryPage
        username="ada"
        library={{
          ...library,
          items: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }}
        view={{ sort: 'added_desc', page: 1 }}
      />,
    )
    expect(await screen.findByText(/Nothing on this shelf yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find something to read' }).getAttribute('href')).toBe(
      '/',
    )
  })

  it('has no serious axe violations', async () => {
    const { container } = renderPage(
      <LibraryPage username="ada" library={library} view={view} viewer={owner} />,
    )
    await screen.findByRole('navigation', { name: 'Shelves' })
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})

describe('PrivateLibrary', () => {
  it('explains the Library is private', async () => {
    renderPage(<PrivateLibrary />)
    expect(await screen.findByRole('heading', { name: 'This library is private' })).toBeTruthy()
  })
})

describe('libraryHref', () => {
  it('leaves defaults out', () => {
    expect(libraryHref('ada', { sort: 'added_desc', page: 1 })).toBe('/u/ada/library')
  })
})
