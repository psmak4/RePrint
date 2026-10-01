// @vitest-environment jsdom
import type { ModQueueItem } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageText, ReviewQueue } from './review-queue.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const item = (n: number, extra: Partial<ModQueueItem> = {}): ModQueueItem => ({
  id: id(n),
  book: { slug: `book-${n}`, title: `Book ${n}` },
  reviewer: {
    username: 'ada',
    displayName: 'Ada',
    approvedCount: 2,
    rejectedCount: 1,
    reportedCount: 3,
  },
  rating: 4,
  headline: 'A headline',
  body: 'First paragraph.\n\nSecond paragraph with https://example.com/x',
  hasSpoilers: true,
  editionId: null,
  version: 1,
  submittedAt: '2026-10-01T00:00:00.000Z',
  lastApproved: null,
  claim: null,
  ...extra,
})
const now = '2026-10-01T03:30:00.000Z'

function renderQueue(
  props: Partial<Parameters<typeof ReviewQueue>[0]> = {},
  action: (body: unknown) => unknown = () => ({ decided: 'approved', reviewId: id(1) }),
) {
  const queue = { items: [item(1), item(2)], meta: { nextCursor: null } }
  const Stub = createRoutesStub([
    {
      path: '/admin/reviews',
      action: async ({ request }) => action(await request.json()),
      Component: () => (
        <ReviewQueue
          queue={queue}
          selected={null}
          requested={false}
          claim={null}
          cursor={null}
          now={now}
          {...props}
        />
      ),
    },
  ])
  return render(<Stub initialEntries={['/admin/reviews']} />)
}

describe('ReviewQueue', () => {
  it('lists Pending reviews in the given (oldest first) order with age and rating', async () => {
    renderQueue()
    const list = await screen.findByRole('list', { name: 'Pending reviews' })
    const links = within(list).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      `/admin/reviews?review=${id(1)}`,
      `/admin/reviews?review=${id(2)}`,
    ])
    expect(within(list).getAllByText('Waiting 3 hours')).toHaveLength(2)
    expect(within(list).getAllByRole('img', { name: '4 out of 5 stars' })).toHaveLength(2)
  })

  it('shows an empty message and a prompt', async () => {
    renderQueue({ queue: { items: [], meta: { nextCursor: null } } })
    expect(await screen.findByText('No reviews are waiting for a decision.')).toBeTruthy()
  })

  it('links to the next page of the queue', async () => {
    renderQueue({ queue: { items: [item(1)], meta: { nextCursor: 'a b' } } })
    const more = await screen.findByRole('link', { name: 'Show more' })
    expect(more.getAttribute('href')).toBe('/admin/reviews?cursor=a%20b')
  })

  it('shows the selected review in full with reviewer history and the claim', async () => {
    renderQueue({
      selected: item(1),
      claim: { state: 'mine', expiresAt: '2026-10-01T03:40:00.000Z' },
    })
    const detail = await screen.findByRole('article', { name: 'Selected review' })
    expect(within(detail).getByText('Book 1')).toBeTruthy()
    expect(within(detail).getByText('Ada (@ada)')).toBeTruthy()
    expect(within(detail).getByText('2 approved · 1 rejected · 3 reported')).toBeTruthy()
    expect(within(detail).getByText('Marked as containing spoilers')).toBeTruthy()
    expect(within(detail).getByText('First paragraph.')).toBeTruthy()
    // Review text is plain: the URL is not a link.
    expect(within(detail).queryByRole('link', { name: /example\.com/ })).toBeNull()
    expect(within(detail).getByRole('status').textContent).toContain('Claimed by you until')
  })

  it('says who holds a claim and when the review left the queue', async () => {
    renderQueue({ selected: item(1), claim: { state: 'other', name: 'Bo' } })
    expect(await screen.findByText('Bo is handling this review.')).toBeTruthy()
    cleanup()
    renderQueue({ requested: true })
    expect(await screen.findByText('That review is no longer waiting for a decision.')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    const { container } = renderQueue({
      selected: item(1),
      claim: { state: 'mine', expiresAt: '2026-10-01T03:40:00.000Z' },
    })
    await screen.findByRole('article', { name: 'Selected review' })
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

const mine = { state: 'mine', expiresAt: '2026-10-01T03:40:00.000Z' } as const

describe('moderation actions', () => {
  it('approves the opened review and moves on to the next one', async () => {
    const action = vi.fn(() => ({ decided: 'approved', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: mine }, action)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'approve', reviewId: id(1) }))
  })

  it('rejects with a saved phrase that can be edited', async () => {
    const action = vi.fn(() => ({ decided: 'rejected', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: mine }, action)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const phrase = 'This review reads as an advertisement or spam.'
    fireEvent.change(screen.getByLabelText('Saved phrase'), { target: { value: phrase } })
    const reason = screen.getByLabelText(/^Reason/) as HTMLTextAreaElement
    expect(reason.value).toBe(phrase)
    fireEvent.change(reason, { target: { value: `${phrase} Thanks.` } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject review' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'reject',
        reviewId: id(1),
        reason: `${phrase} Thanks.`,
      }),
    )
  })

  it('rejects without a reason when none is given', async () => {
    const action = vi.fn(() => ({ decided: 'rejected', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: mine }, action)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject review' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'reject', reviewId: id(1) }))
  })

  it('shows a failed decision and stays on the review', async () => {
    renderQueue({ selected: item(1), claim: mine }, () => ({ formError: 'Nope, try again.' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Nope, try again.')
  })

  it('turns decisions off when another Moderator holds the review', async () => {
    renderQueue({ selected: item(1), claim: { state: 'other', name: 'Bo' } })
    await screen.findByRole('article', { name: 'Selected review' })
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByText(/Another Moderator holds this review/)).toBeTruthy()
  })

  it('compares an edited review with the last approved version', async () => {
    const edited = item(1, {
      version: 2,
      body: 'New text.',
      rating: 5,
      lastApproved: {
        rating: 4,
        headline: 'A headline',
        body: 'Old text.',
        hasSpoilers: true,
        decidedAt: '2026-09-30T00:00:00.000Z',
      },
    })
    renderQueue({ selected: edited, claim: mine })
    const before = await screen.findByRole('region', { name: 'Last approved version' })
    const after = screen.getByRole('region', { name: 'Submitted for review' })
    expect(within(before).getByText('Old text.')).toBeTruthy()
    expect(within(after).getByText('New text.')).toBeTruthy()
    expect(within(after).getByText(/Rating \(Changed\)/)).toBeTruthy()
    expect(within(after).getByText(/Headline \(Unchanged\)/)).toBeTruthy()
  })

  it('shows no comparison for a first submission', async () => {
    renderQueue({ selected: item(1), claim: mine })
    await screen.findByRole('article', { name: 'Selected review' })
    expect(screen.queryByText('Changes since the last approved version')).toBeNull()
  })
})

describe('keyboard shortcuts', () => {
  it('A approves and R opens the reject form', async () => {
    const action = vi.fn(() => ({ decided: 'approved', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: mine }, action)
    await screen.findByRole('button', { name: 'Approve' })
    fireEvent.keyDown(window, { key: 'r' })
    expect(await screen.findByLabelText('Saved phrase')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'a' })
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'approve', reviewId: id(1) }))
  })

  it('does nothing while typing in the reason field', async () => {
    const action = vi.fn(() => ({ decided: 'approved', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: mine }, action)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const reason = screen.getByLabelText(/^Reason/)
    fireEvent.keyDown(reason, { key: 'a' })
    fireEvent.keyDown(reason, { key: 'j' })
    expect(action).not.toHaveBeenCalled()
  })

  it('does not approve when the review is held by another Moderator', async () => {
    const action = vi.fn(() => ({ decided: 'approved', reviewId: id(1) }))
    renderQueue({ selected: item(1), claim: { state: 'other', name: 'Bo' } }, action)
    await screen.findByRole('article', { name: 'Selected review' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(action).not.toHaveBeenCalled()
  })

  it('J and K move between items', async () => {
    function Probe() {
      return <p data-testid="search">{useLocation().search}</p>
    }
    const Stub = createRoutesStub([
      {
        path: '/admin/reviews',
        Component: () => (
          <>
            <Probe />
            <ReviewQueue
              queue={{ items: [item(1), item(2), item(3)], meta: { nextCursor: null } }}
              selected={item(2)}
              requested
              claim={null}
              cursor={null}
              now={now}
            />
          </>
        ),
      },
    ])
    render(<Stub initialEntries={[`/admin/reviews?review=${id(2)}`]} />)
    await screen.findByRole('article', { name: 'Selected review' })
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(`?review=${id(3)}`))
  })

  it('K goes to the previous item and J stops at the end', async () => {
    function Probe() {
      return <p data-testid="search">{useLocation().search}</p>
    }
    const Stub = createRoutesStub([
      {
        path: '/admin/reviews',
        Component: () => (
          <>
            <Probe />
            <ReviewQueue
              queue={{ items: [item(1), item(2)], meta: { nextCursor: null } }}
              selected={item(2)}
              requested
              claim={null}
              cursor={null}
              now={now}
            />
          </>
        ),
      },
    ])
    render(<Stub initialEntries={[`/admin/reviews?review=${id(2)}`]} />)
    await screen.findByRole('article', { name: 'Selected review' })
    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByTestId('search').textContent).toBe(`?review=${id(2)}`)
    fireEvent.keyDown(window, { key: 'k' })
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(`?review=${id(1)}`))
  })

  it('has no axe violations with the reject form and comparison open', async () => {
    const edited = item(1, {
      version: 2,
      lastApproved: {
        rating: 3,
        headline: null,
        body: 'Old.',
        hasSpoilers: false,
        decidedAt: null,
      },
    })
    const { container } = renderQueue({ selected: edited, claim: mine })
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})

describe('ageText', () => {
  it('uses the largest whole unit', () => {
    expect(ageText('2026-10-01T03:29:00.000Z', now)).toBe('1 minute')
    expect(ageText('2026-10-01T00:00:00.000Z', now)).toBe('3 hours')
    expect(ageText('2026-09-28T00:00:00.000Z', now)).toBe('3 days')
  })
})
