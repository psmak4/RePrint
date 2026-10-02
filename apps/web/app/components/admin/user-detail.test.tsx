// @vitest-environment jsdom
import type { AdminUserDetail } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserDetail } from './user-detail.js'

afterEach(cleanup)

const uid = '0192a3b4-0000-7000-8000-000000000001'
const base: AdminUserDetail = {
  user: {
    id: uid,
    username: 'ada',
    displayName: 'Ada',
    email: 'ada@example.com',
    status: 'active',
    roles: ['member'],
    joinedAt: '2026-01-01T00:00:00.000Z',
    reviewCount: 2,
    reportsReceived: 1,
    bio: 'Reads a lot',
    emailVerifiedAt: '2026-01-01T01:00:00.000Z',
    suspendedUntil: null,
    suspendedReason: null,
    deletedAt: null,
  },
  reviews: { approved: 2, pending: 1, rejected: 0, unpublished: 0 },
  reports: { filed: 3, received: 1 },
  admin: {
    sessions: [
      {
        id: uid,
        device: 'Chrome on macOS',
        ip: '203.0.113.9',
        createdAt: '2026-10-01T00:00:00.000Z',
        lastSeenAt: '2026-10-01T02:00:00.000Z',
      },
    ],
    audit: [
      {
        id: uid,
        action: 'role.grant',
        targetType: 'user',
        targetId: uid,
        actor: { id: uid, username: 'root' },
        before: null,
        after: null,
        ip: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
}

function renderDetail(
  detail: AdminUserDetail = base,
  props: { canAssign?: boolean; canSuspend?: boolean } = { canAssign: true, canSuspend: true },
  action: (body: unknown) => unknown = () => ({ done: 'grant', changed: true }),
) {
  const Stub = createRoutesStub([
    {
      path: '/admin/users/:id',
      Component: () => (
        <UserDetail
          detail={detail}
          now="2026-10-02T00:00:00.000Z"
          canAssign={props.canAssign ?? false}
          canSuspend={props.canSuspend ?? false}
        />
      ),
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={[`/admin/users/${uid}`]} />)
}

const withStatus = (status: AdminUserDetail['user']['status'], over = {}): AdminUserDetail => ({
  ...base,
  user: { ...base.user, status, ...over },
})

describe('UserDetail', () => {
  it('shows profile, reviews by status, reports, sessions, and audit history', () => {
    renderDetail()
    expect(screen.getByText('ada@example.com', { exact: false })).toBeTruthy()
    expect(screen.getByText('Reads a lot')).toBeTruthy()
    expect(screen.getByText('Chrome on macOS')).toBeTruthy()
    expect(screen.getByText('role.grant')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reviews by status' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Reports' })).toBeTruthy()
  })

  it('shows the limited view without email, sessions, or audit history', () => {
    renderDetail({ ...base, user: { ...base.user, email: null }, admin: null }, {})
    expect(screen.getByText('Hidden in the limited view')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Sessions' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Audit history' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Make/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'End all sessions' })).toBeNull()
  })

  it('grants and removes roles, only with roles.assign', async () => {
    const action = vi.fn(() => ({ done: 'grant', changed: true }))
    renderDetail(
      withStatus('active', { roles: ['member', 'moderator'] }),
      { canAssign: true },
      action,
    )
    expect(screen.getByRole('button', { name: 'Make Admin' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Moderator role' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ intent: 'revoke', role: 'moderator' }),
    )
    expect(await screen.findByText('The role was granted.')).toBeTruthy()
  })

  it('hides role buttons without roles.assign', () => {
    renderDetail(base, { canSuspend: true })
    expect(screen.queryByRole('button', { name: /Make/ })).toBeNull()
  })

  it('suspends with a reason and end date', async () => {
    const action = vi.fn(() => ({ done: 'suspended' }))
    renderDetail(base, { canSuspend: true }, action)
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    const confirm = screen.getByRole('button', { name: 'Suspend user' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Suspension reason/), { target: { value: 'Spam' } })
    fireEvent.change(screen.getByLabelText(/Suspended until/), { target: { value: '2026-11-01' } })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'suspend',
        reason: 'Spam',
        until: '2026-11-01',
      }),
    )
    expect(await screen.findByText('The user was suspended.')).toBeTruthy()
  })

  it('offers Unsuspend, not Suspend, for a suspended user, and shows the reason', async () => {
    const action = vi.fn(() => ({ done: 'unsuspended' }))
    renderDetail(
      withStatus('suspended', {
        suspendedUntil: '2026-12-01T00:00:00.000Z',
        suspendedReason: 'Spam',
      }),
      { canSuspend: true },
      action,
    )
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull()
    expect(screen.getByText(/Suspended until Dec 1, 2026/)).toBeTruthy()
    expect(screen.getByText(/Reason: Spam/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unsuspend' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'unsuspend' }))
  })

  it('ends all sessions and reports how many', async () => {
    const action = vi.fn(() => ({ done: 'sessions', revoked: 2 }))
    renderDetail(base, { canSuspend: true }, action)
    fireEvent.click(screen.getByRole('button', { name: 'End all sessions' }))
    expect(await screen.findByText('2 sessions were ended.')).toBeTruthy()
  })

  it('offers resend only for unverified accounts', async () => {
    const { unmount } = renderDetail(base, {})
    expect(screen.queryByRole('button', { name: 'Resend verification email' })).toBeNull()
    unmount()
    const action = vi.fn(() => ({ done: 'resent', sent: true }))
    renderDetail(withStatus('unverified', { emailVerifiedAt: null }), {}, action)
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))
    expect(await screen.findByText('The verification email was sent.')).toBeTruthy()
  })

  it('shows an action failure', async () => {
    renderDetail(base, { canSuspend: true }, () => ({ formError: 'Nope.' }))
    fireEvent.click(screen.getByRole('button', { name: 'End all sessions' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Nope.')
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderDetail()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
