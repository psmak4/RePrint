// @vitest-environment jsdom
import type { Profile, ProfileReview } from '@reprint/shared'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { meta } from '../../routes/profile.js'
import { ProfilePage } from './profile-page.js'

afterEach(cleanup)

const profile: Profile = {
  username: 'ada',
  displayName: 'Ada Lovelace',
  bio: 'Reads everything.',
  avatarUrl: null,
  joinedAt: '2026-01-15T00:00:00.000Z',
  reviewCount: 1,
  helpfulVotes: 7,
  libraryPublic: true,
}
const review: ProfileReview = {
  id: '0192a3b4-0000-7000-8000-000000000001',
  rating: 4,
  headline: 'Great',
  body: 'Loved it.',
  hasSpoilers: false,
  helpfulCount: 3,
  submittedAt: '2026-09-01T00:00:00.000Z',
  book: {
    id: '0192a3b4-0000-7000-8000-000000000002',
    slug: 'dune-abc123',
    title: 'Dune',
    subtitle: null,
    cover: null,
    firstPublishedYear: 1965,
    contributions: [],
    rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
  },
}
const viewer = (username: string) => ({
  id: '0192a3b4-0000-7000-8000-000000000009',
  username,
  displayName: username,
  verified: true,
  permissions: [],
})

function renderPage(ui: React.ReactNode) {
  const Stub = createRoutesStub([{ path: '/', Component: () => ui }])
  return render(<Stub />)
}

describe('ProfilePage', () => {
  it('shows the header, totals, reviews, and a Library tab for a public Library', async () => {
    const { container } = renderPage(
      <ProfilePage profile={profile} reviews={[review]} view={{ page: 1, totalPages: 1 }} />,
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeTruthy()
    expect(screen.getByText('@ada')).toBeTruthy()
    expect(screen.getByText('Joined January 2026')).toBeTruthy()
    expect(screen.getByText('Reads everything.')).toBeTruthy()
    expect(screen.getByText('1 review')).toBeTruthy()
    expect(screen.getByText('7 helpful votes')).toBeTruthy()
    expect(screen.getByText('Loved it.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('href')).toBe(
      '/u/ada/library',
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })

  it('hides the Library tab for a private Library, except from the owner', async () => {
    const hidden = { ...profile, libraryPublic: false }
    const first = renderPage(
      <ProfilePage
        profile={hidden}
        reviews={[]}
        view={{ page: 1, totalPages: 0 }}
        viewer={viewer('bob')}
      />,
    )
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull()
    expect(screen.getByText('No approved reviews yet.')).toBeTruthy()
    first.unmount()

    renderPage(
      <ProfilePage
        profile={hidden}
        reviews={[]}
        view={{ page: 1, totalPages: 0 }}
        viewer={viewer('ADA')}
      />,
    )
    expect(await screen.findByRole('link', { name: 'Library' })).toBeTruthy()
  })

  it('links to the next page of reviews', async () => {
    renderPage(
      <ProfilePage profile={profile} reviews={[review]} view={{ page: 1, totalPages: 3 }} />,
    )
    expect((await screen.findByRole('link', { name: 'Next' })).getAttribute('href')).toBe(
      '/u/ada?page=2',
    )
  })
})

describe('profile meta', () => {
  it('has a canonical URL and a description', () => {
    const tags = meta({
      loaderData: {
        profile,
        reviews: [],
        view: { page: 1, totalPages: 0 },
        canonicalUrl: 'https://reprint.test/u/ada',
      },
    } as never)
    expect(tags).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/u/ada',
    })
    expect(tags.find((t) => 'name' in t && t.name === 'description')).toBeTruthy()
  })
})
