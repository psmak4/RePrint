// @vitest-environment jsdom
import type { AdminUserSummary } from '@reprint/shared'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { UsersList } from './users-list.js'

afterEach(cleanup)

const user = (n: number, over: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  id: `0192a3b4-0000-7000-8000-00000000000${n}`,
  username: `user${n}`,
  displayName: `User ${n}`,
  email: `u${n}@example.com`,
  status: 'active',
  roles: ['member'],
  joinedAt: '2026-01-02T00:00:00.000Z',
  reviewCount: n,
  reportsReceived: 0,
  ...over,
})
const noFilters = { q: '', role: '', status: '', joinedFrom: '', joinedTo: '' }

function renderList(props: Partial<Parameters<typeof UsersList>[0]> = {}) {
  const Stub = createRoutesStub([
    {
      path: '/admin/users',
      Component: () => (
        <UsersList
          users={{
            items: [user(1), user(2, { status: 'suspended', roles: ['member', 'moderator'] })],
            meta: { nextCursor: null },
          }}
          filters={noFilters}
          canSearchEmail
          {...props}
        />
      ),
    },
  ])
  return render(<Stub initialEntries={['/admin/users']} />)
}

describe('UsersList', () => {
  it('lists users with status, roles, and a link to each detail page', () => {
    renderList()
    const rows = screen.getAllByRole('row')
    const second = rows[2] as HTMLElement
    expect(within(second).getByRole('link', { name: 'User 2' }).getAttribute('href')).toBe(
      '/admin/users/0192a3b4-0000-7000-8000-000000000002',
    )
    expect(within(second).getByText('Suspended')).toBeTruthy()
    expect(within(second).getByText('Member, Moderator')).toBeTruthy()
    expect(within(second).getByText('u2@example.com')).toBeTruthy()
  })

  it('keeps the filter state from the URL in the form', () => {
    renderList({
      filters: {
        q: 'ada',
        role: 'moderator',
        status: 'suspended',
        joinedFrom: '2026-01-01',
        joinedTo: '',
      },
    })
    expect((screen.getByLabelText('Search by username or email') as HTMLInputElement).value).toBe(
      'ada',
    )
    expect((screen.getByLabelText('Role') as HTMLSelectElement).value).toBe('moderator')
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('suspended')
    expect((screen.getByLabelText('Joined from') as HTMLInputElement).value).toBe('2026-01-01')
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeTruthy()
  })

  it('offers username search and no email column in the limited view', () => {
    renderList({
      canSearchEmail: false,
      users: { items: [user(1, { email: null })], meta: { nextCursor: null } },
    })
    expect(screen.getByLabelText('Search by username')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: 'Email' })).toBeNull()
  })

  it('links to the next page with the filters and cursor in the URL', () => {
    renderList({
      filters: { ...noFilters, status: 'deleted' },
      users: { items: [user(1)], meta: { nextCursor: 'c1' } },
    })
    expect(screen.getByRole('link', { name: 'Show more' }).getAttribute('href')).toBe(
      '/admin/users?status=deleted&cursor=c1',
    )
  })

  it('says so when nothing matches', () => {
    renderList({ users: { items: [], meta: { nextCursor: null } } })
    expect(screen.getByText('No users match these filters.')).toBeTruthy()
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderList()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
