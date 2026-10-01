// @vitest-environment jsdom
import type { ModQueueItem } from '@reprint/shared'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
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

function renderQueue(props: Partial<Parameters<typeof ReviewQueue>[0]> = {}) {
  const queue = { items: [item(1), item(2)], meta: { nextCursor: null } }
  const Stub = createRoutesStub([
    {
      path: '/admin/reviews',
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

describe('ageText', () => {
  it('uses the largest whole unit', () => {
    expect(ageText('2026-10-01T03:29:00.000Z', now)).toBe('1 minute')
    expect(ageText('2026-10-01T00:00:00.000Z', now)).toBe('3 hours')
    expect(ageText('2026-09-28T00:00:00.000Z', now)).toBe('3 days')
  })
})
