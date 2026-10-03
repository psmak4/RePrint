// @vitest-environment jsdom

import type { AdminSystem } from '@reprint/shared'
import { act, cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_MS, SystemDashboard } from './system-dashboard.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const system: AdminSystem = {
  generatedAt: '2026-10-03T12:00:00.000Z',
  source: { requestsPerSecond: 1.25, limitPerSecond: 2, breakerOpen: false },
  searchCache: { hits: 3, misses: 1, hitRate: 0.75 },
  queue: { waiting: 1200, active: 2, delayed: 0, failed: 4, oldestWaitingSeconds: 600 },
}

function renderDashboard(value = system, loader?: () => unknown) {
  const Stub = createRoutesStub([
    {
      path: '/admin/system',
      loader: loader ?? (() => null),
      Component: () => <SystemDashboard system={value} />,
    },
  ])
  return render(<Stub initialEntries={['/admin/system']} />)
}

describe('SystemDashboard', () => {
  it('shows Source rate, cache hit rate, breaker state, and queue depth', async () => {
    renderDashboard()
    expect(await screen.findByText('1.25')).toBeTruthy()
    expect(screen.getByText('Limit: 2 per second')).toBeTruthy()
    expect(screen.getByText('Closed')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('3 hits, 1 misses')).toBeTruthy()
    expect(screen.getByText('1,200')).toBeTruthy()
    expect(screen.getByText('10 min')).toBeTruthy()
  })

  it('says so when the breaker is open and nothing has been looked up or queued', async () => {
    renderDashboard({
      ...system,
      source: { ...system.source, breakerOpen: true },
      searchCache: { hits: 0, misses: 0, hitRate: null },
      queue: { ...system.queue, waiting: 0, oldestWaitingSeconds: null },
    })
    expect(await screen.findByText('Open: Source calls are paused')).toBeTruthy()
    expect(screen.getByText('No lookups yet')).toBeTruthy()
    expect(screen.getByText('Nothing is waiting')).toBeTruthy()
  })

  it('reloads its data every 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const loader = vi.fn(() => null)
    renderDashboard(system, loader)
    await screen.findByText('1.25')
    const before = loader.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS)
    })
    expect(loader.mock.calls.length).toBeGreaterThan(before)
  })

  it('has no axe violations', async () => {
    const { container } = renderDashboard()
    await screen.findByText('1.25')
    const result = await axe.run(container)
    expect(result.violations).toEqual([])
  })
})
