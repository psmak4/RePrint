// @vitest-environment jsdom
import type { BookDetail, BookSummary, Edition } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { BookPage, type MoreByAuthor } from './book-page.js'

afterEach(cleanup)

const id = '0192a3b4-0000-7000-8000-000000000001'
const author = (slug: string, name: string) => ({ id, slug, name })

const edition: Edition = {
  id,
  bookId: id,
  isbn13: '9780441172719',
  format: 'paperback',
  language: 'en',
  title: null,
  publisherName: 'Ace',
  publishedDate: '1990-09-01',
  pageCount: 528,
  cover: null,
}

const book: BookDetail = {
  id,
  slug: 'dune-abc123',
  title: 'Dune',
  subtitle: 'Book One',
  description: 'A desert planet.',
  firstPublishedYear: 1965,
  originalLanguage: 'en',
  primaryEditionId: id,
  cover: null,
  contributions: [
    { author: author('frank-herbert', 'Frank Herbert'), role: 'author', position: 0 },
    { author: author('jane-translator', 'Jane Translator'), role: 'translator', position: 1 },
  ],
  series: [{ series: { slug: 'dune-saga', name: 'Dune Saga' }, position: 1 }],
  genres: [{ slug: 'science-fiction', name: 'Science fiction' }],
  primaryEdition: edition,
  editionCount: 1,
  rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
}

function renderPage(
  overrides: Partial<BookDetail> = {},
  editions: Edition[] = [edition],
  moreByAuthor: MoreByAuthor | null = null,
  extra: Partial<ComponentProps<typeof BookPage>> = {},
) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <BookPage
          book={{ ...book, ...overrides }}
          editions={editions}
          moreByAuthor={moreByAuthor}
          {...extra}
        />
      ),
    },
  ])
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub />
    </QueryClientProvider>,
  )
}

describe('BookPage header', () => {
  it('shows the details from the Book and its Primary Edition', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Dune' })).toBeTruthy()
    expect(screen.getByText('Book One')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Frank Herbert' }).getAttribute('href')).toBe(
      '/authors/frank-herbert',
    )
    expect(screen.getByText(/translated by/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dune Saga · Book 1' }).getAttribute('href')).toBe(
      '/series/dune-saga',
    )
    const facts = screen.getAllByRole('definition').map((d) => d.textContent)
    expect(facts).toEqual(expect.arrayContaining(['1965', '528', 'Ace', 'English', '1']))
    expect(
      within(screen.getByRole('list', { name: 'Genres' })).getByRole('link', {
        name: 'Science fiction',
      }),
    ).toBeTruthy()
    expect(screen.getByText('No RePrint reviews yet')).toBeTruthy()
  })

  it('shows a decimal Series position', () => {
    renderPage({ series: [{ series: { slug: 's', name: 'S' }, position: 2.5 }] })
    expect(screen.getByRole('link', { name: 'S · Book 2.5' })).toBeTruthy()
  })

  it('hides rows with missing data', () => {
    renderPage(
      {
        subtitle: null,
        series: [],
        genres: [],
        editionCount: 0,
        firstPublishedYear: null,
        contributions: [book.contributions[0] as BookDetail['contributions'][number]],
        primaryEdition: { ...edition, pageCount: null, publisherName: null },
      },
      [],
    )
    expect(screen.queryByText('First published')).toBeNull()
    expect(screen.queryByText('Pages')).toBeNull()
    expect(screen.queryByText('Publisher')).toBeNull()
    expect(screen.queryByText(/translated by/)).toBeNull()
    expect(screen.queryByRole('list', { name: 'Genres' })).toBeNull()
    expect(screen.queryByText(/Editions/)).toBeNull()
  })

  it('works with no Primary Edition', () => {
    renderPage({ primaryEdition: null, primaryEditionId: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Dune' })).toBeTruthy()
  })
})

describe('description', () => {
  it('says so when there is none', () => {
    renderPage({ description: null })
    expect(screen.getByText('No description yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull()
  })

  it('shows a short description with no toggle', () => {
    renderPage()
    expect(screen.getByText('A desert planet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Read (more|less)/ })).toBeNull()
  })

  it('collapses a long description at 6 lines with an accessible toggle', () => {
    renderPage({ description: 'A long story. '.repeat(50) })
    const text = document.getElementById('book-description-text')
    expect(text?.className).toContain('line-clamp-6')
    const toggle = screen.getByRole('button', { name: 'Read more' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('book-description-text')
    fireEvent.click(toggle)
    expect(text?.className).not.toContain('line-clamp-6')
    expect(screen.getByRole('button', { name: 'Read less' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })
})

describe('side lists', () => {
  it('lists Editions in a card with a format filter', () => {
    const ebook: Edition = {
      ...edition,
      id: '0192a3b4-0000-7000-8000-000000000003',
      format: 'ebook',
    }
    renderPage({}, [edition, ebook])
    const card = screen.getByRole('heading', { name: 'Editions' }).closest('section')
    expect(card).not.toBeNull()
    const inCard = within(card as HTMLElement)
    expect(inCard.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(inCard.getByRole('button', { name: 'E-book' }))
    expect(inCard.getAllByRole('listitem')).toHaveLength(1)
    expect(inCard.getByRole('button', { name: 'E-book' }).getAttribute('aria-pressed')).toBe('true')
  })

  const other = (n: number, slug: string, title: string): BookSummary => ({
    id: `0192a3b4-0000-7000-8000-00000000001${n}`,
    slug,
    title,
    subtitle: null,
    cover: null,
    firstPublishedYear: 1969,
    contributions: [],
    rating: { average: 4, count: 3, distribution: [0, 0, 1, 1, 1] },
  })

  it('shows rows of more Books by the author and in the Genre', () => {
    renderPage(
      {},
      [edition],
      {
        authorName: 'Frank Herbert',
        authorSlug: 'frank-herbert',
        books: [other(1, 'messiah-def456', 'Dune Messiah')],
      },
      {
        moreInGenre: {
          genreName: 'Science fiction',
          genreSlug: 'science-fiction',
          books: [other(2, 'neuromancer-1', 'Neuromancer')],
        },
      },
    )
    expect(screen.getByRole('heading', { name: 'More by Frank Herbert' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'More in Science fiction' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Dune Messiah' })[0]?.getAttribute('href')).toBe(
      '/books/messiah-def456',
    )
  })

  it('shows the Series and Author cards when their data loaded', () => {
    renderPage({}, [edition], null, {
      series: {
        name: 'Dune Saga',
        slug: 'dune-saga',
        total: 2,
        books: [
          { slug: 'dune-abc123', title: 'Dune', cover: null, position: '1' },
          { slug: 'messiah-def456', title: 'Dune Messiah', cover: null, position: '2' },
        ],
      },
      author: {
        name: 'Frank Herbert',
        slug: 'frank-herbert',
        photo: null,
        born: '1920',
        died: '1986',
        bio: 'Wrote Dune.',
        bookCount: 4,
      },
    })
    expect(screen.getByText(/You're here/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Up next: Dune Messiah' })).toBeTruthy()
    expect(screen.getByText('Wrote Dune.')).toBeTruthy()
  })
})

describe('section nav', () => {
  const links = () =>
    within(screen.getByRole('navigation', { name: 'On this page' }))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))

  it('leaves out items for empty sections', () => {
    renderPage({ series: [] }, [])
    expect(links()).toEqual(['#overview', '#reviews'])
  })

  it('lists every section that has content', () => {
    renderPage({}, [edition], null, {
      author: {
        name: 'Frank Herbert',
        slug: 'frank-herbert',
        photo: null,
        born: null,
        died: null,
        bio: null,
        bookCount: 1,
      },
      series: {
        name: 'Dune Saga',
        slug: 'dune-saga',
        total: 1,
        books: [{ slug: 'dune-abc123', title: 'Dune', cover: null, position: '1' }],
      },
    })
    expect(links()).toEqual(['#overview', '#reviews', '#series', '#editions', '#author'])
  })
})

describe('rating breakdown', () => {
  it('filters reviews through the URL when a bar is pressed', () => {
    const seen: string[] = []
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => (
          <BookPage
            book={{ ...book, rating: { average: 4, count: 3, distribution: [0, 0, 1, 1, 1] } }}
            editions={[]}
            moreByAuthor={null}
          />
        ),
      },
      {
        path: '/books/:slug',
        Component: () => {
          seen.push('navigated')
          return <p>filtered</p>
        },
      },
    ])
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Stub />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '5 stars: 1 review' }))
    expect(seen).toEqual(['navigated'])
  })

  it('is left out before the first review', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /stars?: \d reviews?/ })).toBeNull()
  })
})
