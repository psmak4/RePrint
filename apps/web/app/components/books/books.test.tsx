// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { BookCard, type BookCardData } from './book-card.js'
import { Cover } from './cover.js'
import { RatingDisplay } from './rating-display.js'

afterEach(cleanup)

const olCover = {
  origin: 'open_library' as const,
  originRef: '8231856',
  width: null,
  height: null,
  url: null,
}

describe('Cover', () => {
  it('loads the image by cover ID and size', () => {
    render(<Cover cover={olCover} title="Dune" size="large" />)
    const img = screen.getByRole('img', { name: 'Cover of Dune' })
    expect(img.getAttribute('src')).toContain('/b/id/8231856-L.jpg')
    const small = render(<Cover cover={olCover} title="Dune" size="small" />)
    expect(small.container.querySelector('img')?.getAttribute('src')).toContain('8231856-S.jpg')
  })

  it('falls back to a generated cover when there is no image', () => {
    render(<Cover cover={null} title="Dune" authorName="Frank Herbert" />)
    expect(screen.getByRole('img', { name: 'Cover of Dune' })).toBeTruthy()
    expect(screen.getByText('Dune')).toBeTruthy()
    expect(screen.getByText('Frank Herbert')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('falls back to a generated cover when the image fails to load', () => {
    const { container } = render(<Cover cover={olCover} title="Dune" authorName="Frank Herbert" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    if (img) fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('Frank Herbert')).toBeTruthy()
  })

  it('has no image to load for an upload without a URL', () => {
    render(<Cover cover={{ ...olCover, origin: 'upload', originRef: 'x' }} title="Dune" />)
    expect(document.querySelector('img')).toBeNull()
  })
})

describe('RatingDisplay', () => {
  it('shows the average and count with an accessible label', () => {
    render(<RatingDisplay rating={{ average: 4.26, count: 12 }} />)
    expect(screen.getByText('Rated 4.3 out of 5 from 12 reviews')).toBeTruthy()
    expect(screen.getByText('4.3')).toBeTruthy()
    expect(screen.getByText('(12)')).toBeTruthy()
  })

  it('uses the singular for one review', () => {
    render(<RatingDisplay rating={{ average: 5, count: 1 }} />)
    expect(screen.getByText('Rated 5.0 out of 5 from 1 review')).toBeTruthy()
  })

  it('says there are no reviews before the first one', () => {
    render(<RatingDisplay rating={{ average: null, count: 0 }} />)
    expect(screen.getByText('No RePrint reviews yet')).toBeTruthy()
  })
})

describe('BookCard', () => {
  const book: BookCardData = {
    title: 'Dune',
    subtitle: 'A novel',
    cover: null,
    firstPublishedYear: 1965,
    authorNames: ['Frank Herbert', 'Someone Else'],
    rating: { average: 4.5, count: 3 },
  }

  function renderCard(data: BookCardData) {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <BookCard book={data} href="/books/dune" /> },
    ])
    return render(<Stub />)
  }

  it('shows cover, title link, authors, year, and rating', async () => {
    renderCard(book)
    const link = await screen.findByRole('link', { name: 'Dune' })
    expect(link.getAttribute('href')).toBe('/books/dune')
    expect(screen.getByRole('img', { name: 'Cover of Dune' })).toBeTruthy()
    expect(screen.getByText('by Frank Herbert, Someone Else')).toBeTruthy()
    expect(screen.getByText('First published 1965')).toBeTruthy()
    expect(screen.getByText('Rated 4.5 out of 5 from 3 reviews')).toBeTruthy()
  })

  it('shows "No RePrint reviews yet" and hides missing rows', async () => {
    renderCard({ ...book, subtitle: null, firstPublishedYear: null, authorNames: [], rating: null })
    expect(await screen.findByText('No RePrint reviews yet')).toBeTruthy()
    expect(screen.queryByText(/First published/)).toBeNull()
    expect(screen.queryByText(/^by /)).toBeNull()
  })
})
