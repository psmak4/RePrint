// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminCard, Badge, EmptyState, StatTile, USER_STATUS_TONE } from './admin-ui.js'
import { AdminIcon } from './icons.js'

afterEach(cleanup)

describe('admin building blocks', () => {
  it('Badge carries its tone and an optional dot', () => {
    render(
      <Badge tone="red" dot>
        Suspended
      </Badge>,
    )
    const badge = screen.getByText('Suspended')
    expect(badge.className).toContain('text-danger')
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('maps every user status to a tone', () => {
    expect(USER_STATUS_TONE).toEqual({
      active: 'green',
      unverified: 'amber',
      suspended: 'red',
      deleted: 'gray',
    })
  })

  it('AdminCard labels its section by its title', () => {
    render(<AdminCard title="Profile">body</AdminCard>)
    expect(screen.getByRole('region', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Profile' })).toBeTruthy()
  })

  it('StatTile puts the value in the dd after its label', () => {
    render(
      <dl>
        <StatTile label="Waiting" value="3" note="Oldest 2 min" />
      </dl>,
    )
    expect(screen.getByText('Waiting').tagName).toBe('DT')
    expect(screen.getByText('Waiting').nextElementSibling?.textContent).toBe('3')
    expect(screen.getByText('Oldest 2 min').tagName).toBe('DD')
  })

  it('EmptyState shows its sentence with a check', () => {
    const { container } = render(<EmptyState>Nothing waits.</EmptyState>)
    expect(screen.getByText('Nothing waits.')).toBeTruthy()
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('AdminIcon is decorative', () => {
    const { container } = render(<AdminIcon name="users" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
