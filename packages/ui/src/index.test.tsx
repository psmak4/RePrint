// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, cn } from './index.js'

describe('@reprint/ui', () => {
  it('renders a Button with its variant classes', () => {
    render(<Button variant="secondary">Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.className).toContain('bg-surface')
  })

  it('renders the child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/books">Browse</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('href')).toBe('/books')
  })

  it('merges conflicting Tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})
