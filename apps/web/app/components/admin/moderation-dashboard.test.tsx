// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ModerationDashboard } from './moderation-dashboard.js'

afterEach(cleanup)

const now = '2026-10-01T03:30:00.000Z'

function renderDashboard(stats: Parameters<typeof ModerationDashboard>[0]['stats']) {
  const Stub = createRoutesStub([
    { path: '/admin', Component: () => <ModerationDashboard stats={stats} now={now} /> },
  ])
  return render(<Stub initialEntries={['/admin']} />)
}

describe('ModerationDashboard', () => {
  it('shows the pending count and the age of the oldest review', () => {
    renderDashboard({
      pendingCount: 4,
      oldestPendingAt: '2026-10-01T00:30:00.000Z',
      oldestPendingAgeSeconds: 10800,
    })
    expect(screen.getByText('Pending reviews').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('Oldest has waited 3 hours')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the review queue' }).getAttribute('href')).toBe(
      '/admin/reviews',
    )
  })

  it('says so when nothing is waiting', () => {
    renderDashboard({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null })
    expect(screen.getByText('No reviews are waiting.')).toBeTruthy()
  })

  it('has a slot for open reports until M7', () => {
    renderDashboard({ pendingCount: 0, oldestPendingAt: null, oldestPendingAgeSeconds: null })
    expect(screen.getByText('Open reports')).toBeTruthy()
    expect(screen.getAllByText('Reports are not available yet.').length).toBeGreaterThan(0)
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderDashboard({
      pendingCount: 2,
      oldestPendingAt: '2026-10-01T00:00:00.000Z',
      oldestPendingAgeSeconds: 12600,
    })
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
