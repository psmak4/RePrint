// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { CatalogDashboard } from './catalog-dashboard.js'

afterEach(cleanup)

const stats = {
  totals: { books: 12_345, editions: 20_000, authors: 900 },
  monthly: [
    { month: '2026-09', books: 10, editions: 15, authors: 4 },
    { month: '2026-10', books: 0, editions: 0, authors: 0 },
  ],
}

function renderDashboard(value = stats) {
  const Stub = createRoutesStub([
    { path: '/admin/catalog', Component: () => <CatalogDashboard stats={value} /> },
  ])
  return render(<Stub initialEntries={['/admin/catalog']} />)
}

describe('CatalogDashboard', () => {
  it('shows the Catalog size and monthly growth', () => {
    renderDashboard()
    expect(screen.getByText('12,345')).toBeTruthy()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1] as HTMLElement).getByText('Sep 2026')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('15')).toBeTruthy()
  })

  it('says so when nothing was added', () => {
    renderDashboard({
      ...stats,
      monthly: [{ month: '2026-10', books: 0, editions: 0, authors: 0 }],
    })
    expect(screen.getByText('Nothing was added in the last 12 months.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderDashboard()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
