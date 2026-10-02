// @vitest-environment jsdom
import type { ModReportItem } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportsQueue } from './reports-queue.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const item = (n: number): ModReportItem => ({
  review: {
    id: id(n),
    status: 'approved',
    hidden: n === 1,
    book: { slug: `book-${n}`, title: `Book ${n}` },
    author: { id: id(n + 5), username: 'ada', displayName: 'Ada' },
    rating: 4,
    headline: 'A headline',
    body: 'Body text with https://example.com/x',
    hasSpoilers: false,
  },
  openCount: 2,
  oldestReportedAt: '2026-10-01T00:00:00.000Z',
  reports: [
    {
      id: id(n + 2),
      reason: 'spam',
      note: null,
      createdAt: '2026-10-01T00:00:00.000Z',
      reporter: { username: 'bo', displayName: 'Bo' },
    },
    {
      id: id(n + 3),
      reason: 'other',
      note: 'Quotes a stranger',
      createdAt: '2026-10-01T01:00:00.000Z',
      reporter: { username: 'cy', displayName: 'Cy' },
    },
  ],
})
const now = '2026-10-01T03:30:00.000Z'

function renderQueue(
  props: Partial<Parameters<typeof ReportsQueue>[0]> = {},
  action: (body: unknown) => unknown = () => ({ done: 'dismissed', reviewId: id(1) }),
) {
  const queue = { items: [item(1), item(2)], meta: { nextCursor: null } }
  const Stub = createRoutesStub([
    {
      path: '/admin/reports',
      Component: () => (
        <ReportsQueue
          queue={queue}
          cursor={null}
          now={now}
          canUnpublish
          canSuspend={false}
          {...props}
        />
      ),
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/admin/reports']} />)
}

describe('ReportsQueue', () => {
  it('shows each review with its reports, reasons, and notes', () => {
    renderQueue()
    const first = screen.getAllByRole('article')[0] as HTMLElement
    expect(within(first).getByText('Book 1')).toBeTruthy()
    expect(within(first).getByText(/2 open reports/)).toBeTruthy()
    expect(within(first).getByText('Hidden until a moderator decides')).toBeTruthy()
    expect(within(first).getByText('Spam or advertising')).toBeTruthy()
    expect(within(first).getByText('Quotes a stranger')).toBeTruthy()
    expect(within(first).getByText('Reported by Cy', { exact: false })).toBeTruthy()
    // Review text is plain text: nothing in it is a link.
    expect(within(first).queryByRole('link', { name: /example\.com/ })).toBeNull()
  })

  it('says so when the queue is empty', () => {
    renderQueue({ queue: { items: [], meta: { nextCursor: null } } })
    expect(screen.getByText('No reviews have open reports.')).toBeTruthy()
  })

  it('dismisses with one click', async () => {
    const action = vi.fn(() => ({ done: 'dismissed', reviewId: id(1) }))
    renderQueue({}, action)
    const first = screen.getAllByRole('article')[0] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'dismiss', reviewId: id(1) }))
    expect(await within(first).findByText('The reports were dismissed.')).toBeTruthy()
  })

  it('unpublishes only with a reason', async () => {
    const action = vi.fn(() => ({ done: 'unpublished', reviewId: id(1) }))
    renderQueue({}, action)
    const first = screen.getAllByRole('article')[0] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'Unpublish' }))
    const confirm = within(first).getByRole('button', { name: 'Unpublish review' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(first).getByLabelText(/Reason/), { target: { value: 'Spam' } })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ intent: 'unpublish', reviewId: id(1), reason: 'Spam' }),
    )
    expect(await within(first).findByText('The review was unpublished.')).toBeTruthy()
  })

  it('shows "Suspend author" only to Admins, and sends the author and end date', async () => {
    const { unmount } = renderQueue({ canSuspend: false })
    expect(screen.queryByRole('button', { name: 'Suspend author' })).toBeNull()
    unmount()

    const action = vi.fn(() => ({ done: 'suspended', reviewId: id(1) }))
    renderQueue({ canSuspend: true }, action)
    const first = screen.getAllByRole('article')[0] as HTMLElement
    fireEvent.click(within(first).getByRole('button', { name: 'Suspend author' }))
    fireEvent.change(within(first).getByLabelText(/Suspension reason/), {
      target: { value: 'Repeated spam' },
    })
    fireEvent.change(within(first).getByLabelText(/Suspended until/), {
      target: { value: '2026-11-01' },
    })
    fireEvent.click(within(first).getByRole('button', { name: 'Suspend author' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'suspend',
        reviewId: id(1),
        userId: id(6),
        reason: 'Repeated spam',
        until: '2026-11-01',
      }),
    )
  })

  it('hides Unpublish without the permission', () => {
    renderQueue({ canUnpublish: false })
    expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(2)
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderQueue({ canSuspend: true })
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
