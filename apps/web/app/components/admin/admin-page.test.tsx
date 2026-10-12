// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub, Outlet } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { type AdminNavGroup, AdminPage } from './admin-page.js'

afterEach(cleanup)

const groups: AdminNavGroup[] = [
  {
    label: 'Moderation',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
      { to: '/admin/reviews', label: 'Review queue', icon: 'reviews', count: 3 },
    ],
  },
  { label: 'People', items: [{ to: '/admin/users', label: 'Users', icon: 'users' }] },
]

function renderPage(path = '/admin/users') {
  const Stub = createRoutesStub([
    {
      path: '/admin',
      Component: () => <Outlet context={groups} />,
      children: [
        {
          path: 'users',
          Component: () => (
            <AdminPage
              title="Users"
              lead="Every account."
              crumbs={[{ label: 'Administration', to: '/admin' }, { label: 'Users' }]}
              actions={<button type="button">Export</button>}
            >
              <p>Body</p>
            </AdminPage>
          ),
        },
      ],
    },
  ])
  return render(<Stub initialEntries={[path]} />)
}

describe('AdminPage', () => {
  it('puts the page title, breadcrumb, lead, and actions in the band', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeTruthy()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'Administration' }).getAttribute('href')).toBe(
      '/admin',
    )
    expect(within(crumbs).getByText('Users').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Every account.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
  })

  it('groups the nav, marks the current page, and reads counts as waiting', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'Administration sections' })
    expect(within(nav).getAllByText('Moderation').length).toBeGreaterThan(0)
    expect(
      within(nav).getAllByRole('link', { name: 'Users' })[0]?.getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(nav).getAllByRole('link', { name: 'Review queue, 3 waiting' }).length,
    ).toBeGreaterThan(0)
  })

  it('marks only the exact section, except Users, which stays marked on a user’s page', () => {
    const nested: AdminNavGroup[] = [
      {
        label: 'Catalog',
        items: [
          { to: '/admin/catalog', label: 'Catalog', icon: 'catalog' },
          { to: '/admin/catalog/genres', label: 'Genres and rules', icon: 'genres' },
        ],
      },
      { label: 'People', items: [{ to: '/admin/users', label: 'Users', icon: 'users' }] },
    ]
    const page = () => (
      <AdminPage title="Page">
        <p>x</p>
      </AdminPage>
    )
    const Stub = createRoutesStub([
      {
        path: '/admin',
        Component: () => <Outlet context={nested} />,
        children: [
          { path: 'catalog/genres', Component: page },
          { path: 'users/:id', Component: page },
        ],
      },
    ])
    const current = () =>
      within(screen.getByRole('navigation', { name: 'Administration sections' }))
        .getAllByRole('link')
        .filter((link) => link.getAttribute('aria-current') === 'page')
        .map((link) => link.textContent)
    const { unmount } = render(<Stub initialEntries={['/admin/catalog/genres']} />)
    expect([...new Set(current())]).toEqual(['Genres and rules'])
    unmount()
    render(<Stub initialEntries={['/admin/users/42']} />)
    expect([...new Set(current())]).toEqual(['Users'])
  })

  it('renders without a nav outside the admin layout (component tests)', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <AdminPage title="Alone">x</AdminPage> },
    ])
    render(<Stub initialEntries={['/']} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Alone' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Administration sections' })).toBeNull()
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderPage()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
