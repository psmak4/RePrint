// @vitest-environment jsdom
import type { Me, SessionInfo } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, data } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../../copy/index.js'
import { SecuritySettingsPage } from './security-settings-page.js'

afterEach(cleanup)

const c = copy.settings.security

const me: Me = {
  id: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
  email: 'reader@example.com',
  username: 'reader',
  displayName: 'Reader One',
  bio: null,
  avatarUrl: null,
  verified: true,
  libraryPublic: true,
  emailReviewDecisions: true,
}

const sessions: SessionInfo[] = [
  {
    id: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a01',
    device: 'Firefox on macOS',
    ip: '203.0.113.5',
    createdAt: '2026-09-01T10:00:00.000Z',
    lastSeenAt: '2026-09-29T10:00:00.000Z',
    current: true,
  },
  {
    id: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a02',
    device: 'Safari on iOS',
    ip: null,
    createdAt: '2026-09-02T10:00:00.000Z',
    lastSeenAt: '2026-09-28T10:00:00.000Z',
    current: false,
  },
]

/** Every security form posts to the same action; the recorded bodies show what was sent. */
function renderPage(respond: (body: Record<string, unknown>) => unknown = () => ({})) {
  const bodies: Record<string, unknown>[] = []
  const Stub = createRoutesStub([
    {
      path: '/settings/security',
      Component: () => <SecuritySettingsPage me={me} sessions={sessions} />,
      action: async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        return respond(body)
      },
    },
  ])
  render(<Stub initialEntries={['/settings/security']} />)
  return bodies
}

function fill(label: string, value: string, index = 0) {
  fireEvent.change(screen.getAllByLabelText(label)[index] as HTMLElement, { target: { value } })
}

describe('change email', () => {
  it('asks for the current password before sending anything', async () => {
    const bodies = renderPage()
    fill(c.email.newEmailLabel, 'new@example.com')
    fireEvent.click(screen.getByRole('button', { name: c.email.submit }))
    expect(await screen.findByText('Enter your current password.')).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('shows the pending state until the link is opened', async () => {
    const bodies = renderPage(() => ({ pendingEmail: 'new@example.com' }))
    fill(c.email.newEmailLabel, 'new@example.com')
    fill(c.currentPasswordLabel, 'old password 123', 0)
    fireEvent.click(screen.getByRole('button', { name: c.email.submit }))
    expect(await screen.findByText(c.email.pendingBody('new@example.com'))).toBeTruthy()
    expect(bodies[0]).toEqual({
      intent: 'change-email',
      newEmail: 'new@example.com',
      currentPassword: 'old password 123',
    })
    expect(screen.getByText(c.email.lead('reader@example.com'))).toBeTruthy()
  })

  it('shows the API message for a wrong password on the field', async () => {
    renderPage(() => data({ fieldErrors: { currentPassword: 'That password is wrong.' } }, 400))
    fill(c.email.newEmailLabel, 'new@example.com')
    fill(c.currentPasswordLabel, 'nope', 0)
    fireEvent.click(screen.getByRole('button', { name: c.email.submit }))
    expect(await screen.findByText('That password is wrong.')).toBeTruthy()
  })
})

describe('change password', () => {
  it('needs the current password and a valid new one', async () => {
    const bodies = renderPage()
    fill(c.password.newPasswordLabel, 'short')
    fireEvent.click(screen.getByRole('button', { name: c.password.submit }))
    expect(await screen.findByText('Enter your current password.')).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('sends both passwords and confirms', async () => {
    const bodies = renderPage(() => ({ changed: true }))
    fill(c.currentPasswordLabel, 'old password 123', 1)
    fill(c.password.newPasswordLabel, 'a brand new password')
    fireEvent.click(screen.getByRole('button', { name: c.password.submit }))
    expect(await screen.findByText(c.password.done)).toBeTruthy()
    expect(bodies[0]).toEqual({
      intent: 'change-password',
      currentPassword: 'old password 123',
      newPassword: 'a brand new password',
    })
  })
})

describe('active devices', () => {
  it('lists the devices and marks this one', () => {
    renderPage()
    expect(screen.getByText('Firefox on macOS')).toBeTruthy()
    expect(screen.getByText('Safari on iOS')).toBeTruthy()
    expect(screen.getByText(c.sessions.thisDevice)).toBeTruthy()
  })

  it('ends one session by id', async () => {
    const bodies = renderPage()
    fireEvent.click(screen.getByRole('button', { name: c.sessions.endLabel('Safari on iOS') }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ intent: 'end-session', id: sessions[1]?.id })
  })

  it('logs out everywhere', async () => {
    const bodies = renderPage()
    fireEvent.click(screen.getByRole('button', { name: c.sessions.logoutAll }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ intent: 'logout-all' })
  })

  it('shows a failure from the API', async () => {
    renderPage(() => data({ formError: c.sessions.failed }, 500))
    fireEvent.click(screen.getByRole('button', { name: c.sessions.logoutAll }))
    expect(await screen.findByText(c.sessions.failed)).toBeTruthy()
  })
})

describe('delete account', () => {
  it('explains the 30-day erase and needs the password', async () => {
    const bodies = renderPage()
    expect(screen.getByText(c.delete.erase)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: c.delete.submit }))
    expect(await screen.findByText('Enter your password.')).toBeTruthy()
    expect(bodies).toHaveLength(0)
  })

  it('sends the typed password', async () => {
    const bodies = renderPage()
    fill(c.delete.passwordLabel, 'my password 1234')
    fireEvent.click(screen.getByRole('button', { name: c.delete.submit }))
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ intent: 'delete-account', password: 'my password 1234' })
  })
})
