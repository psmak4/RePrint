// @vitest-environment jsdom
import type { NotificationListResponse } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { NotificationBell } from './notification-bell.js'

afterEach(cleanup)

const item = (
  id: string,
  type: NotificationListResponse['items'][number]['type'],
  read: boolean,
) => ({
  id,
  type,
  data: {},
  read,
  createdAt: '2026-05-01T12:00:00.000Z',
})

function list(items: NotificationListResponse['items']): NotificationListResponse {
  return {
    items,
    meta: { page: 1, pageSize: 10, total: items.length, totalPages: 1 },
    unreadCount: items.filter((n) => !n.read).length,
  }
}

function renderBell(notifications: NotificationListResponse | null, onRead = vi.fn()) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <NotificationBell notifications={notifications} /> },
    {
      path: '/notifications/read',
      action: async () => {
        onRead()
        return { read: true }
      },
    },
  ])
  const view = render(<Stub />)
  return { ...view, onRead }
}

describe('NotificationBell', () => {
  it('renders nothing without notifications data', () => {
    const { container } = renderBell(null)
    expect(container.querySelector('details')).toBeNull()
  })

  it('shows the unread count on the bell and lists the notifications', () => {
    renderBell(list([item('a', 'password_changed', false), item('b', 'email_changed', true)]))
    expect(screen.getByLabelText(copy.shell.notifications.unreadLabel(1))).toBeTruthy()
    expect(screen.getByText(copy.shell.notifications.messages.password_changed)).toBeTruthy()
    expect(screen.getByText(copy.shell.notifications.messages.email_changed)).toBeTruthy()
  })

  it('has no count label when everything is read, and says when the list is empty', () => {
    renderBell(list([]))
    expect(screen.getByLabelText(copy.shell.notifications.label)).toBeTruthy()
    expect(screen.getByText(copy.shell.notifications.empty)).toBeTruthy()
  })

  it('marks notifications read when the list is opened', async () => {
    const { container, onRead } = renderBell(list([item('a', 'review_approved', false)]))
    const details = container.querySelector('details')
    if (!details) throw new Error('no details')
    details.open = true
    fireEvent(details, new Event('toggle'))
    await waitFor(() => expect(onRead).toHaveBeenCalledTimes(1))
    // The item stays marked as new while the list is open.
    expect(screen.getByText(copy.shell.notifications.unreadMark, { exact: false })).toBeTruthy()
  })

  it('does not call the API when opened with nothing unread', async () => {
    const { container, onRead } = renderBell(list([item('a', 'email_changed', true)]))
    const details = container.querySelector('details')
    if (!details) throw new Error('no details')
    details.open = true
    fireEvent(details, new Event('toggle'))
    await new Promise((r) => setTimeout(r, 20))
    expect(onRead).not.toHaveBeenCalled()
  })
})
