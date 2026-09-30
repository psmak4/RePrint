// @vitest-environment jsdom
import type { AuthorDetail, BookSummary } from '@reprint/shared'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthorPage, groupWorks, lifeDates } from './author-page.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const herbert = { id: id(9), slug: 'frank-herbert', name: 'Frank Herbert' }

const summary = (n: number, title: string, count: number, average: number | null = null) =>
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

const author: AuthorDetail = {
  ...herbert,
  alternateNames: ['Frank P. Herbert'],
  bio: 'An American science fiction writer.',
  birthDate: '1920-10-08',
  deathDate: '1986-02-11',
  photo: null,
  works: [
    { role: 'author', books: [summary(1, 'Dune', 12, 4.5), summary(2, 'Dune Messiah', 3, 3.8)] },
    { role: 'co_author', books: [summary(3, 'Hellstrom', 5, 4.1)] },
    { role: 'narrator', books: [summary(4, 'Audio', 0)] },
  ],
}

function renderPage(overrides: Partial<AuthorDetail> = {}) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <AuthorPage author={{ ...author, ...overrides }} /> },
  ])
  return render(<Stub />)
}

describe('AuthorPage', () => {
  it('shows the name, life dates, other names, and bio', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Frank Herbert' })).toBeTruthy()
    expect(screen.getByText('1920 to 1986')).toBeTruthy()
    expect(screen.getByText('Also known as Frank P. Herbert')).toBeTruthy()
    expect(screen.getByText('An American science fiction writer.')).toBeTruthy()
  })

  it('falls back with no photo, dates, other names, or bio', () => {
    renderPage({ photo: null, birthDate: null, deathDate: null, alternateNames: [], bio: null })
    expect(screen.getByRole('img', { name: 'Photo of Frank Herbert' })).toBeTruthy()
    expect(screen.queryByText(/Born|Died| to /)).toBeNull()
    expect(screen.queryByText(/Also known as/)).toBeNull()
    expect(screen.getByText('No biography yet')).toBeTruthy()
  })

  it('loads the photo image when the Author has one', () => {
    renderPage({
      photo: { origin: 'open_library', originRef: '123', width: null, height: null, url: null },
    })
    const img = screen.getByRole('img', { name: 'Photo of Frank Herbert' })
    expect(img.getAttribute('src')).toContain('covers.openlibrary.org')
  })

  it('groups Books by Role, most reviewed first, with each rating', () => {
    renderPage()
    const written = screen.getByRole('region', { name: 'Written' })
    const titles = within(written)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    // The co-author Book merges into Written and sorts by review count.
    expect(titles).toEqual(['Dune', 'Hellstrom', 'Dune Messiah'])
    expect(within(written).getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe(
      '/books/dune-abc121',
    )
    expect(within(written).getByText(/Rated 4\.5 out of 5 from 12 reviews/)).toBeTruthy()
    const narrated = screen.getByRole('region', { name: 'Narrated' })
    expect(within(narrated).getByText('No RePrint reviews yet')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Translated' })).toBeNull()
  })

  it('says so when there are no Books', () => {
    renderPage({ works: [] })
    expect(screen.getByText('No books on RePrint yet')).toBeTruthy()
  })
})

describe('groupWorks and lifeDates', () => {
  it('keeps the API order on ties and drops repeats', () => {
    const groups = groupWorks([
      { role: 'author', books: [summary(1, 'A', 2), summary(2, 'B', 2)] },
      { role: 'co_author', books: [summary(2, 'B', 2)] },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.books.map((b) => b.title)).toEqual(['A', 'B'])
  })

  it('formats partial life dates', () => {
    expect(lifeDates('1920-10-08', null)).toBe('Born 1920')
    expect(lifeDates(null, '1986-02-11')).toBe('Died 1986')
    expect(lifeDates(null, null)).toBeNull()
  })
})
