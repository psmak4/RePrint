// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatedCoverColor } from '../../lib/cover-color.js'
import { ReviewExcerpt } from '../reviews/review-excerpt.js'
import { AuthorCard } from './author-card.js'
import { AuthorMatchCard } from './author-match-card.js'
import { BookRail } from './book-rail.js'
import { Cover } from './cover.js'
import { DetailsList } from './details-list.js'
import { EditionsCard, type EditionsCardItem } from './editions-card.js'
import { FactsRow } from './facts-row.js'
import { GenreTile } from './genre-tile.js'
import { RatingBreakdown } from './rating-breakdown.js'
import { SectionNav } from './section-nav.js'
import { SeriesCard } from './series-card.js'
import { StarRating } from './star-rating.js'
import { TrustBadge } from './trust-badge.js'

afterEach(cleanup)

function renderInRouter(ui: React.ReactElement) {
  const Stub = createRoutesStub([{ path: '/', Component: () => ui }])
  return render(<Stub />)
}

describe('generated cover', () => {
  it('uses the colour picked from the slug and reserves 2:3', () => {
    const { container } = render(
      <Cover cover={null} title="Dune" slug="dune" authorName="Frank Herbert" />,
    )
    const cover = container.querySelector('[data-generated-cover]') as HTMLElement
    expect(cover.className).toMatch(/bg-\[#[0-9a-f]{6}\]/)
    const again = render(<Cover cover={null} title="Other title" slug="dune" />)
    const second = again.container.querySelector('[data-generated-cover]') as HTMLElement
    expect(second.className).toBe(cover.className)
    // The CSP (`style-src 'self'`) blocks style attributes, so a cover carries none.
    expect(container.querySelectorAll('[style]')).toHaveLength(0)
    expect(generatedCoverColor('dune')).toBeTruthy()
    expect(cover.className).toContain('aspect-[2/3]')
  })

  it('draws a dashed frame for a Book that is not on RePrint yet', () => {
    const { container } = render(<Cover cover={null} title="Dune" slug="dune" dashed />)
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })
})

describe('StarRating', () => {
  it('is named "Rated X out of 5" and fills partially', () => {
    render(<StarRating average={4.3} />)
    expect(screen.getByRole('img', { name: 'Rated 4.3 out of 5' })).toBeTruthy()
    const fill = screen.getByTestId('star-fill')
    expect(fill.className).toContain('w-[85%]')
    expect(fill.hasAttribute('style')).toBe(false)
  })

  it('sizes to its stars so the fill stays a share of five stars inside a stretched flex column', () => {
    render(<StarRating average={3} />)
    expect(screen.getByRole('img', { name: 'Rated 3.0 out of 5' }).className).toContain('w-max')
  })

  it('clamps out-of-range averages', () => {
    render(<StarRating average={7} />)
    expect(screen.getByRole('img', { name: 'Rated 5.0 out of 5' })).toBeTruthy()
  })
})

describe('RatingBreakdown', () => {
  it('toggles the filter with its bars', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <RatingBreakdown
        average={4.2}
        count={10}
        distribution={[0, 1, 1, 3, 5]}
        selected={null}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '5 stars: 5 reviews' }))
    expect(onSelect).toHaveBeenLastCalledWith(5)
    rerender(
      <RatingBreakdown
        average={4.2}
        count={10}
        distribution={[0, 1, 1, 3, 5]}
        selected={5}
        onSelect={onSelect}
      />,
    )
    const pressed = screen.getByRole('button', { name: '5 stars: 5 reviews' })
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pressed)
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})

const editions: EditionsCardItem[] = [
  { id: '1', format: 'hardcover', publisher: 'Chilton', publishedYear: 1965, isbn13: null },
  { id: '2', format: 'paperback', publisher: 'Ace', publishedYear: 1990, isbn13: '9780441013593' },
  { id: '3', format: 'ebook', publisher: null, publishedYear: null, isbn13: null },
]

describe('EditionsCard', () => {
  it('filters Editions by format', () => {
    render(<EditionsCard editions={editions} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Paperback' }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(within(items[0] as HTMLElement).getByText(/Ace/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Paperback' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'All formats' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('has no filter when there is one format', () => {
    render(<EditionsCard editions={[editions[0] as EditionsCardItem]} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SectionNav', () => {
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'reviews', label: 'Reviews', count: 12 },
  ]

  it('marks the first item current and follows clicks', () => {
    render(<SectionNav items={items} />)
    const overview = screen.getByRole('link', { name: 'Overview' })
    const reviews = screen.getByRole('link', { name: /Reviews/ })
    expect(overview.getAttribute('aria-current')).toBe('location')
    expect(reviews.getAttribute('aria-current')).toBeNull()
    expect(reviews.getAttribute('href')).toBe('#reviews')
    fireEvent.click(reviews)
    expect(reviews.getAttribute('aria-current')).toBe('location')
    expect(overview.getAttribute('aria-current')).toBeNull()
  })

  it('renders nothing without items', () => {
    const { container } = render(<SectionNav items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('presentational components', () => {
  const book = {
    title: 'Dune',
    cover: null,
    firstPublishedYear: 1965,
    authorNames: ['Frank Herbert'],
    rating: { average: 4.5, count: 3 },
  }

  it('BookRail links each Book and hides when empty', () => {
    renderInRouter(
      <BookRail label="Top rated" items={[{ slug: 'dune', book, note: '46 new reviews' }]} />,
    )
    expect(screen.getByRole('link', { name: 'Dune' }).getAttribute('href')).toBe('/books/dune')
    expect(screen.getByText('46 new reviews')).toBeTruthy()
    cleanup()
    const { container } = renderInRouter(<BookRail label="Top rated" items={[]} />)
    expect(container.querySelector('section')).toBeNull()
  })

  it('GenreTile shows the name and links to the Genre', () => {
    renderInRouter(
      <GenreTile
        name="Science fiction"
        href="/genres/science-fiction"
        bookCount={1}
        books={[{ slug: 'dune', title: 'Dune', cover: null }]}
      />,
    )
    expect(screen.getByRole('link', { name: /Science fiction/ }).getAttribute('href')).toBe(
      '/genres/science-fiction',
    )
    expect(screen.getByText('1 book')).toBeTruthy()
  })

  it('ReviewExcerpt shows plain text, the reviewer, and a link', () => {
    renderInRouter(
      <ReviewExcerpt
        review={{
          rating: 5,
          headline: 'A classic',
          excerpt: '<b>Gripping</b> from page one…',
          authorName: 'Ana',
        }}
        book={{ slug: 'dune', title: 'Dune', cover: null }}
        href="/books/dune#reviews"
      />,
    )
    expect(screen.getByText('<b>Gripping</b> from page one…')).toBeTruthy()
    expect(screen.getByText('by Ana')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Read the full review of Dune' }).getAttribute('href'),
    ).toBe('/books/dune#reviews')
  })

  it('FactsRow and DetailsList leave out empty entries', () => {
    const facts = render(<FactsRow facts={[{ label: 'Pages', value: '412' }]} />)
    expect(facts.getByText('Pages')).toBeTruthy()
    cleanup()
    render(
      <DetailsList
        rows={[
          { label: 'Publisher', value: 'Ace' },
          { label: 'Pages', value: null },
        ]}
      />,
    )
    expect(screen.getByText('Publisher')).toBeTruthy()
    expect(screen.queryByText('Pages')).toBeNull()
  })

  it('SeriesCard marks the current Book and links to what is next', () => {
    renderInRouter(
      <SeriesCard
        name="Dune Chronicles"
        href="/series/dune-chronicles"
        currentSlug="dune"
        total={6}
        books={[
          { slug: 'dune', title: 'Dune', cover: null, position: '1' },
          { slug: 'dune-messiah', title: 'Dune Messiah', cover: null, position: '2' },
        ]}
      />,
    )
    expect(screen.getByText("You're here")).toBeTruthy()
    expect(screen.getByText('Book 1 of 6')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Up next: Dune Messiah' }).getAttribute('href')).toBe(
      '/books/dune-messiah',
    )
  })

  it('AuthorCard and AuthorMatchCard link to the Author', () => {
    renderInRouter(
      <AuthorCard
        name="Frank Herbert"
        href="/authors/frank-herbert"
        born="1920"
        died="1986"
        bio="Writer."
        bookCount={4}
      />,
    )
    expect(screen.getByText('1920 to 1986')).toBeTruthy()
    expect(screen.getByText('4 books on RePrint')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'More about Frank Herbert' }).getAttribute('href'),
    ).toBe('/authors/frank-herbert')
    cleanup()
    renderInRouter(
      <AuthorMatchCard name="Frank Herbert" href="/authors/frank-herbert" bookCount={4} />,
    )
    expect(screen.getByRole('link', { name: /Frank Herbert/ }).getAttribute('href')).toBe(
      '/authors/frank-herbert',
    )
  })

  it('TrustBadge says a moderator reads every review', () => {
    render(<TrustBadge />)
    expect(screen.getByText('Read by a moderator')).toBeTruthy()
  })
})
