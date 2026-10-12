// @vitest-environment jsdom
import type { ModStats } from '@reprint/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { createRoutesStub, Outlet, useLoaderData } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import AdminIndex from './admin-index.js'

afterEach(cleanup)

const stats: ModStats = {
  pendingCount: 4,
  oldestPendingAt: '2026-10-01T00:30:00.000Z',
  oldestPendingAgeSeconds: 10800,
  openReportCount: 0,
  oldestOpenReportAt: null,
  oldestOpenReportAgeSeconds: null,
}

/** The dashboard under the `/admin` layout, as the app nests them. */
function renderDashboard(layoutStats: ModStats | null) {
  const Stub = createRoutesStub([
    {
      id: 'routes/admin',
      path: '/admin',
      loader: () => ({ groups: [], stats: layoutStats }),
      Component: () => <Outlet context={[]} />,
      children: [
        {
          index: true,
          loader: () => ({ now: '2026-10-01T03:30:00.000Z', oldest: [] }),
          Component: () => <AdminIndex {...({ loaderData: useLoaderData() } as never)} />,
        },
      ],
    },
  ])
  return render(<Stub initialEntries={['/admin']} />)
}

describe('admin dashboard route', () => {
  it('shows the numbers the layout already loaded', async () => {
    renderDashboard(stats)
    expect((await screen.findByText('Pending reviews')).nextElementSibling?.textContent).toBe('4')
  })

  it('says the numbers could not be loaded when the layout has none', async () => {
    renderDashboard(null)
    expect(
      await screen.findByText(
        'We could not load the moderation dashboard. Please try again in a moment.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
  })
})
