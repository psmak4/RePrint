// @vitest-environment jsdom
import type { ModQueueItem } from '@reprint/shared'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ModerationDashboard } from './moderation-dashboard.js'

afterEach(cleanup)

const now = '2026-10-01T03:30:00.000Z'

type Stats = Parameters<typeof ModerationDashboard>[0]['stats']

const noReports: Pick<
  Stats,
  'openReportCount' | 'oldestOpenReportAt' | 'oldestOpenReportAgeSeconds'
> = { openReportCount: 0, oldestOpenReportAt: null, oldestOpenReportAgeSeconds: null }

const item = (id: string, title: string, submittedAt: string): ModQueueItem => ({
  id,
  book: { slug: `${id}-slug`, title },
  reviewer: {
    username: 'quietreader',
    displayName: 'Q',
    approvedCount: 0,
    rejectedCount: 0,
    reportedCount: 0,
  },
  rating: 4,
  headline: null,
  body: 'x',
  hasSpoilers: false,
  editionId: null,
  version: 1,
  submittedAt,
  lastApproved: null,
  claim: null,
})

function renderDashboard(
  pending: Omit<Stats, keyof typeof noReports>,
  reports: Partial<typeof noReports> = {},
  oldest: ModQueueItem[] | null = null,
) {
  const stats: Stats = { ...pending, ...noReports, ...reports }
  const Stub = createRoutesStub([
    {
      path: '/admin',
      Component: () => <ModerationDashboard stats={stats} now={now} oldest={oldest} />,
    },
  ])
  return render(<Stub initialEntries={['/admin']} />)
}

const empty = { pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null }

describe('ModerationDashboard', () => {
  it('puts Dashboard in the band under the Administration eyebrow', () => {
    renderDashboard(empty)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Administration')).toBeTruthy()
  })

  it('shows the pending count, the oldest age as a badge, and a pill to the queue', () => {
    renderDashboard({
      pendingCount: 4,
      oldestPendingAt: '2026-10-01T00:30:00.000Z',
      oldestPendingAgeSeconds: 10800,
    })
    expect(screen.getByText('Pending reviews').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('Oldest has waited 3 hours').className).toContain('rounded-full')
    const link = screen.getByRole('link', { name: 'Open the review queue' })
    expect(link.getAttribute('href')).toBe('/admin/reviews')
    expect(link.className).toContain('rounded-full')
  })

  it('says so when nothing is waiting and leaves the list out', () => {
    renderDashboard(empty, {}, [])
    expect(screen.getByText('No reviews are waiting.')).toBeTruthy()
    expect(screen.getByText('No reports are open.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Waiting longest' })).toBeNull()
  })

  it('shows the open report count and the age of the oldest report', () => {
    renderDashboard(empty, {
      openReportCount: 5,
      oldestOpenReportAt: '2026-09-29T03:30:00.000Z',
      oldestOpenReportAgeSeconds: 172800,
    })
    expect(screen.getByText('Open reports').nextElementSibling?.textContent).toBe('5')
    expect(screen.getByText('Oldest has waited 2 days')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open the reports queue' }).getAttribute('href'),
    ).toBe('/admin/reports')
  })

  it('lists the oldest pending reviews with an Open pill each', () => {
    renderDashboard(
      {
        pendingCount: 5,
        oldestPendingAt: '2026-10-01T01:30:00.000Z',
        oldestPendingAgeSeconds: 7200,
      },
      {},
      [
        item('a', 'Kindred', '2026-10-01T01:30:00.000Z'),
        item('b', 'Piranesi', '2026-10-01T03:20:00.000Z'),
      ],
    )
    const list = screen.getByRole('region', { name: 'Waiting longest' })
    // `getAll`: a Book without a Cover shows its title on the generated Cover too.
    expect(within(list).getAllByText('Kindred').length).toBeGreaterThan(0)
    expect(within(list).getByText('Waiting 2 hours')).toBeTruthy()
    expect(
      within(list).getByRole('link', { name: 'Open the review of Kindred' }).getAttribute('href'),
    ).toBe('/admin/reviews?review=a')
    expect(within(list).getByRole('link', { name: 'See all 5' }).getAttribute('href')).toBe(
      '/admin/reviews',
    )
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderDashboard(
      {
        pendingCount: 2,
        oldestPendingAt: '2026-10-01T00:00:00.000Z',
        oldestPendingAgeSeconds: 12600,
      },
      {},
      [item('a', 'Kindred', '2026-10-01T00:00:00.000Z')],
    )
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
