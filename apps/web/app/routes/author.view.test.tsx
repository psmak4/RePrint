// @vitest-environment jsdom
import type { AuthorDetail } from '@reprint/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRoutesStub, Link, Outlet, useLoaderData } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import Author from './author.js'

afterEach(cleanup)

type AuthorProps = Parameters<typeof Author>[0]

const author = (n: number, slug: string, name: string): AuthorDetail => ({
  id: `0192a3b4-0000-7000-8000-00000000000${n}`,
  slug,
  name,
  alternateNames: [],
  bio: null,
  birthDate: null,
  deathDate: null,
  photo: { origin: 'open_library', originRef: `${n}`, width: null, height: null, url: null },
  works: [],
})

const authors: Record<string, AuthorDetail> = {
  'frank-herbert': author(1, 'frank-herbert', 'Frank Herbert'),
  'brian-herbert': author(2, 'brian-herbert', 'Brian Herbert'),
}

function renderAuthors() {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <>
          <Link to="/authors/brian-herbert">Co-author</Link>
          <Outlet />
        </>
      ),
      children: [
        {
          path: 'authors/:slug',
          loader: ({ params }) => ({ jsonLd: [], author: authors[params.slug ?? ''] }),
          Component: () => {
            // The stub passes no route props; hand the component the loader's data the way the app does.
            const props = { loaderData: useLoaderData() } as unknown as AuthorProps
            return <Author {...props} />
          },
        },
      ],
    },
  ])
  return render(<Stub initialEntries={['/authors/frank-herbert']} />)
}

describe('moving from one Author to another', () => {
  it("shows the new Author's photo even when the last one's failed to load", async () => {
    renderAuthors()
    const photo = await screen.findByRole('img', { name: 'Photo of Frank Herbert' })
    fireEvent.error(photo)
    expect(screen.getByRole('img', { name: 'Photo of Frank Herbert' }).tagName).toBe('DIV')
    fireEvent.click(screen.getByRole('link', { name: 'Co-author' }))
    await screen.findByRole('heading', { level: 1, name: 'Brian Herbert' })
    expect(screen.getByRole('img', { name: 'Photo of Brian Herbert' }).tagName).toBe('IMG')
  })
})
