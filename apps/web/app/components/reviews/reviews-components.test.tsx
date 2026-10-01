// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SpoilerToggle } from './spoiler-toggle.js'
import { StarRatingInput } from './star-rating-input.js'

afterEach(cleanup)

function Harness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial)
  return <StarRatingInput value={value} onChange={setValue} />
}

async function seriousViolations(container: HTMLElement) {
  const results = await axe.run(container)
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
}

describe('StarRatingInput', () => {
  it('is a radio group of five radios labelled "N stars"', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Your rating' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '1 star' })).toBeTruthy()
    for (const n of [2, 3, 4, 5])
      expect(screen.getByRole('radio', { name: `${n} stars` })).toBeTruthy()
  })

  it('selects with a click and checks only that radio', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }))
    expect((screen.getByRole('radio', { name: '4 stars' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: '5 stars' }) as HTMLInputElement).checked).toBe(false)
  })

  it('keeps one radio tabbable: the selected one, or the first', () => {
    const { unmount } = render(<Harness />)
    expect(screen.getByRole('radio', { name: '1 star' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: '3 stars' }).getAttribute('tabindex')).toBe('-1')
    unmount()
    render(<Harness initial={3} />)
    expect(screen.getByRole('radio', { name: '3 stars' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: '1 star' }).getAttribute('tabindex')).toBe('-1')
  })

  it('moves and selects with the arrow keys, wrapping at the ends', () => {
    render(<Harness initial={2} />)
    const two = screen.getByRole('radio', { name: '2 stars' })
    fireEvent.keyDown(two, { key: 'ArrowRight' })
    expect((screen.getByRole('radio', { name: '3 stars' }) as HTMLInputElement).checked).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '3 stars' }))
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' })
    expect((screen.getByRole('radio', { name: '2 stars' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' })
    expect((screen.getByRole('radio', { name: '5 stars' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' })
    expect((screen.getByRole('radio', { name: '1 star' }) as HTMLInputElement).checked).toBe(true)
  })

  it('jumps with Home and End', () => {
    render(<Harness initial={3} />)
    fireEvent.keyDown(screen.getByRole('radio', { name: '3 stars' }), { key: 'End' })
    expect((screen.getByRole('radio', { name: '5 stars' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
    expect((screen.getByRole('radio', { name: '1 star' }) as HTMLInputElement).checked).toBe(true)
  })

  it('has no serious or critical axe violations', async () => {
    const { container } = render(<Harness initial={3} />)
    expect(await seriousViolations(container)).toEqual([])
  })
})

describe('SpoilerToggle', () => {
  it('hides the content behind a "Show spoilers" button', () => {
    render(
      <SpoilerToggle>
        <p>The butler did it.</p>
      </SpoilerToggle>,
    )
    const button = screen.getByRole('button', { name: 'Show spoilers' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('This review contains spoilers.')).toBeTruthy()
    expect(screen.queryByText('The butler did it.')).toBeNull()
  })

  it('reveals and re-hides the content, updating aria-expanded', () => {
    render(
      <SpoilerToggle>
        <p>The butler did it.</p>
      </SpoilerToggle>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show spoilers' }))
    const button = screen.getByRole('button', { name: 'Hide spoilers' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('The butler did it.')).toBeTruthy()
    expect(button.getAttribute('aria-controls')).toBe(
      screen.getByText('The butler did it.').parentElement?.id,
    )
    fireEvent.click(button)
    expect(screen.queryByText('The butler did it.')).toBeNull()
  })

  it('has no serious or critical axe violations, closed or open', async () => {
    const { container } = render(
      <SpoilerToggle>
        <p>The butler did it.</p>
      </SpoilerToggle>,
    )
    expect(await seriousViolations(container)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Show spoilers' }))
    expect(await seriousViolations(container)).toEqual([])
  })
})
