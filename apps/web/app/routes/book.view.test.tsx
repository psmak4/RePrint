// @vitest-environment jsdom
import type { BookDetail, Shelf } from '@reprint/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, Link, Outlet, useLoaderData } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Book from './book.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type BookProps = Parameters<typeof Book>[0]

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`

function book(n: number, title: string, viewerShelf: Shelf | null): BookDetail {
  return {
    id: id(n),
    slug: `book-${n}`,
    title,
    subtitle: null,
    description: null,
    firstPublishedYear: 1954,
    originalLanguage: 'en',
    primaryEditionId: null,
    cover: null,
    contributions: [],
    series: [],
    genres: [],
    primaryEdition: null,
    editionCount: 0,
    rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
    viewerShelf,
  }
}

// The Fellowship is on the viewer's Reading shelf; The Two Towers is on no shelf.
const books: Record<string, BookDetail> = {
  'book-1': book(1, 'The Fellowship of the Ring', 'reading'),
  'book-2': book(2, 'The Two Towers', null),
}

/** The Book route as the app mounts it, with a link to the other Book outside the page. */
function renderBooks() {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <>
          <Link to="/books/book-2">Next in the Series</Link>
          <Outlet />
        </>
      ),
      children: [
        {
          path: 'books/:slug',
          loader: ({ params }) => ({
            jsonLd: [],
            book: books[params.slug ?? ''],
            editions: [],
            moreByAuthor: null,
            authorCard: null,
            series: null,
            moreInGenre: null,
            viewer: {
              id: id(9),
              username: 'ada',
              displayName: 'Ada',
              verified: true,
              permissions: [],
            },
            myReview: null,
            reviews: null,
            reviewQuery: { sort: 'most_helpful', page: 1 },
            votedReviewIds: [],
          }),
          Component: () => {
            // The stub passes no route props; hand the component the loader's data the way the app does.
            const props = { loaderData: useLoaderData() } as unknown as BookProps
            return <Book {...props} />
          },
        },
      ],
    },
  ])
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Stub initialEntries={['/books/book-1']} />
    </QueryClientProvider>,
  )
}

const shelfFor = (title: string) =>
  screen.getByRole('combobox', { name: `Shelf for ${title}` }) as HTMLSelectElement

async function goToTheTwoTowers() {
  await screen.findByRole('heading', { level: 1, name: 'The Fellowship of the Ring' })
  expect(shelfFor('The Fellowship of the Ring').value).toBe('reading')
  fireEvent.click(screen.getByRole('link', { name: 'Next in the Series' }))
  await screen.findByRole('heading', { level: 1, name: 'The Two Towers' })
}

describe('moving from one Book to another', () => {
  it('shows the new Book on no shelf when it is on none', async () => {
    renderBooks()
    await goToTheTwoTowers()
    expect(shelfFor('The Two Towers').value).toBe('')
  })

  it('shelves the Book on screen, not the one before it', async () => {
    const fetch = vi.fn(async (_url: string) => Response.json({ shelf: 'want_to_read' }))
    vi.stubGlobal('fetch', fetch)
    renderBooks()
    await goToTheTwoTowers()
    fireEvent.change(shelfFor('The Two Towers'), { target: { value: 'want_to_read' } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch.mock.calls[0]?.[0]).toBe('/books/book-2/shelf')
  })
})
