// @vitest-environment jsdom
import type { AdminAuditResponse } from '@reprint/shared'
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AuditLog } from './audit-log.js'

afterEach(cleanup)

const noFilters = { actor: '', action: '', targetType: '', targetId: '', from: '', to: '' }
const entries: AdminAuditResponse = {
  items: [
    {
      id: '0192a3b4-0000-7000-8000-000000000001',
      action: 'user.suspend',
      targetType: 'user',
      targetId: '0192a3b4-0000-7000-8000-000000000009',
      actor: { id: '0192a3b4-0000-7000-8000-000000000002', username: 'root' },
      before: { status: 'active' },
      after: { status: 'suspended' },
      ip: '203.0.113.9',
      createdAt: '2026-02-03T04:05:06.000Z',
    },
    {
      id: '0192a3b4-0000-7000-8000-000000000003',
      action: 'role.grant',
      targetType: 'user',
      targetId: null,
      actor: null,
      before: null,
      after: null,
      ip: null,
      createdAt: '2026-02-02T00:00:00.000Z',
    },
  ],
  meta: { nextCursor: null },
}

function renderLog(props: Partial<Parameters<typeof AuditLog>[0]> = {}) {
  const Stub = createRoutesStub([
    {
      path: '/admin/audit',
      Component: () => <AuditLog entries={entries} filters={noFilters} {...props} />,
    },
  ])
  return render(<Stub initialEntries={['/admin/audit']} />)
}

describe('AuditLog', () => {
  it('shows who, what, target, and before and after values', () => {
    renderLog()
    const row = screen.getAllByRole('row')[1] as HTMLElement
    expect(within(row).getByText('root')).toBeTruthy()
    expect(within(row).getByText('user.suspend')).toBeTruthy()
    expect(within(row).getByText('203.0.113.9')).toBeTruthy()
    expect(row.textContent).toContain('"status": "active"')
    expect(row.textContent).toContain('"status": "suspended"')
    const erased = screen.getAllByRole('row')[2] as HTMLElement
    expect(within(erased).getByText('Account erased')).toBeTruthy()
    expect(within(erased).getAllByText('No values recorded')).toHaveLength(2)
  })

  it('has a filter form that submits by GET and keeps the current filters', () => {
    renderLog({ filters: { ...noFilters, actor: 'root', action: 'user.suspend' } })
    expect((screen.getByLabelText('Actor (username)') as HTMLInputElement).value).toBe('root')
    expect((screen.getByLabelText('Action') as HTMLSelectElement).value).toBe('user.suspend')
    expect(screen.getByRole('button', { name: 'Filter' }).closest('form')?.method).toBe('get')
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeTruthy()
  })

  it('exports the filtered rows and pages with the cursor', () => {
    renderLog({
      entries: { ...entries, meta: { nextCursor: 'next1' } },
      filters: { ...noFilters, action: 'role.grant' },
    })
    expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe(
      '/admin/audit.csv?action=role.grant',
    )
    expect(screen.getByRole('link', { name: 'Show more' }).getAttribute('href')).toBe(
      '/admin/audit?action=role.grant&cursor=next1',
    )
  })

  it('says so when nothing matches', () => {
    renderLog({ entries: { items: [], meta: { nextCursor: null } } })
    expect(screen.getByText('No audit entries match these filters.')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    const { container } = renderLog()
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
