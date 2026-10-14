// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { OutsideRatings } from './outside-ratings.js'

afterEach(cleanup)

const openLibrary = {
  sourceName: 'Open Library',
  average: 4.29,
  count: 500,
  distribution: [16, 18, 41, 155, 270],
}

describe('OutsideRatings (D-204)', () => {
  it('shows one labeled line per Source with the average to one decimal', () => {
    render(<OutsideRatings ratings={[openLibrary]} />)
    const panel = screen.getByRole('region', { name: 'Ratings elsewhere' })
    expect(panel.textContent).toContain('Open Library readers')
    expect(panel.textContent).toContain('4.3')
    expect(panel.textContent).toContain('500 ratings')
    expect(within(panel).getByText('Average 4.3 out of 5')).toBeTruthy()
  })

  it('reads 1 rating in the singular', () => {
    render(
      <OutsideRatings ratings={[{ ...openLibrary, count: 1, distribution: [0, 0, 0, 0, 1] }]} />,
    )
    expect(screen.getByRole('region').textContent).toContain('1 rating')
    expect(screen.getByRole('region').textContent).not.toContain('1 ratings')
  })

  it('reveals its own breakdown, with a text alternative for each bar', () => {
    render(<OutsideRatings ratings={[openLibrary]} />)
    const toggle = screen.getByRole('button', { name: 'Show breakdown' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('list')).toBeNull()
    fireEvent.click(toggle)
    expect(
      screen.getByRole('button', { name: 'Hide breakdown' }).getAttribute('aria-expanded'),
    ).toBe('true')
    const list = screen.getByRole('list', { name: 'Open Library readers’ ratings by stars' })
    expect(within(list).getByText('5 stars: 270')).toBeTruthy()
    expect(within(list).getByText('1 star: 16')).toBeTruthy()
  })

  it('renders nothing without ratings', () => {
    const { container } = render(<OutsideRatings ratings={[]} />)
    expect(container.textContent).toBe('')
  })

  it('has no axe violations, open or closed', async () => {
    const { container } = render(<OutsideRatings ratings={[openLibrary]} />)
    expect((await axe.run(container)).violations).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Show breakdown' }))
    expect((await axe.run(container)).violations).toEqual([])
  })
})
