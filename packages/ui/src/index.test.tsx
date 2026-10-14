// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, buttonVariants, cn, Input, Label, Select } from './index.js'

describe('@reprint/ui', () => {
  it('renders a Button with its variant classes', () => {
    render(<Button variant="secondary">Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.className).toContain('bg-surface')
  })

  it('pairs each Button height with one text size (D-214)', () => {
    const sizes = [
      ['sm', 'h-10', 'text-sm'],
      ['default', 'h-11', 'text-[15px]'],
      ['lg', 'h-12', 'text-base'],
    ] as const
    for (const [size, height, text] of sizes) {
      const classes = buttonVariants({ size }).split(' ')
      expect(classes).toContain(height)
      expect(classes).toContain(text)
      expect(classes).toContain('rounded-full')
      expect(classes).toContain('font-semibold')
    }
    expect(buttonVariants({ size: 'icon' }).split(' ')).toContain('size-11')
    expect(buttonVariants({ size: 'icon-sm' }).split(' ')).toContain('size-9')
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

  it('renders an Input that a Label names', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" />
      </>,
    )
    expect(screen.getByLabelText('Email').getAttribute('type')).toBe('email')
  })

  it('renders a native Select with the shared look, in either size', () => {
    render(
      <>
        <Label htmlFor="sort">Sort</Label>
        <Select id="sort" defaultValue="new" className="w-full">
          <option value="top">Top</option>
          <option value="new">Newest</option>
        </Select>
        <Label htmlFor="small">Small</Label>
        <Select id="small" compact>
          <option>One</option>
        </Select>
      </>,
    )
    const sort = screen.getByLabelText('Sort') as HTMLSelectElement
    expect(sort.tagName).toBe('SELECT')
    expect(sort.value).toBe('new')
    expect(sort.className).toContain('ui-select')
    expect(sort.className).toContain('ui-select-menu')
    expect(sort.className).toContain('h-11')
    expect(sort.className).toContain('w-full')
    expect(screen.getByLabelText('Small').className).toContain('h-10')
  })
})
