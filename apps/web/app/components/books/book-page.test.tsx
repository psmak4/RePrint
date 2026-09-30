// @vitest-environment jsdom
import type { BookDetail, BookSummary, Edition } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <BookPage
          book={{ ...book, ...overrides }}
          editions={editions}
          moreByAuthor={moreByAuthor}
        />
      ),
    },
  ])
  return render(<Stub />)
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
    expect(screen.getByRole('link', { name: 'Dune Saga, book 1' }).getAttribute('href')).toBe(
      '/series/dune-saga',
    )
    expect(screen.getByText('First published 1965')).toBeTruthy()
    expect(screen.getByText('528 pages')).toBeTruthy()
    expect(screen.getByText('Published by Ace')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Science fiction' })).toBeTruthy()
    expect(screen.getByText('No RePrint reviews yet')).toBeTruthy()
  })

  it('shows a decimal Series position', () => {
    renderPage({ series: [{ series: { slug: 's', name: 'S' }, position: 2.5 }] })
    expect(screen.getByRole('link', { name: 'S, book 2.5' })).toBeTruthy()
  })

  it('hides rows with missing data', () => {
    renderPage(
      {
        subtitle: null,
        series: [],
        genres: [],
        firstPublishedYear: null,
        contributions: [book.contributions[0] as BookDetail['contributions'][number]],
        primaryEdition: { ...edition, pageCount: null, publisherName: null },
      },
      [],
    )
    expect(screen.queryByText(/First published/)).toBeNull()
    expect(screen.queryByText(/pages/)).toBeNull()
    expect(screen.queryByText(/Published by/)).toBeNull()
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
    expect(screen.queryByRole('button')).toBeNull()
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
  it('lists Editions in a collapsible section', () => {
    const { container } = renderPage()
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(within(details as HTMLElement).getByText('Editions (1)')).toBeTruthy()
    expect(within(details as HTMLElement).getByText('Paperback')).toBeTruthy()
    expect(within(details as HTMLElement).getByText(/1990 · Ace · ISBN 9780441172719/)).toBeTruthy()
  })

  it('lists more Books by the author', () => {
    const other: BookSummary = {
      id: '0192a3b4-0000-7000-8000-000000000002',
      slug: 'messiah-def456',
      title: 'Dune Messiah',
      subtitle: null,
      cover: null,
      firstPublishedYear: 1969,
      contributions: [],
      rating: { average: 4, count: 3, distribution: [0, 0, 1, 1, 1] },
    }
    renderPage({}, [edition], {
      authorName: 'Frank Herbert',
      authorSlug: 'frank-herbert',
      books: [other],
    })
    expect(screen.getByRole('heading', { name: 'More by Frank Herbert' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dune Messiah' }).getAttribute('href')).toBe(
      '/books/messiah-def456',
    )
  })
})
