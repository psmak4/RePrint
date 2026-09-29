// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../../copy/index.js'
import { AppShell } from './app-shell.js'

// jsdom's ARIA role map does not know the <search> element yet, so find it by tag.
function searchOf(header: HTMLElement): HTMLElement {
  const el = header.querySelector<HTMLElement>('search')
  if (!el) throw new Error('no <search> in header')
  return el
}

function renderShell() {
  return render(
    <AppShell
      searchSlot={<input aria-label="test search" />}
      accountSlot={<button type="button">acct</button>}
    >
      <p>page body</p>
    </AppShell>,
  )
}

describe('AppShell', () => {
  afterEach(cleanup)

  it('makes the skip link the first focusable element and targets main', () => {
    const { container } = renderShell()
    const first = container.querySelector('a, button, input')
    expect(first?.textContent).toBe(copy.shell.skipToContent)
    expect(first?.getAttribute('href')).toBe('#main')
    expect(screen.getByRole('main').id).toBe('main')
  })

  it('renders header with logo, search slot, and account slot', () => {
    renderShell()
    const header = screen.getByRole('banner')
    expect(
      within(header).getByRole('link', { name: copy.shell.homeLinkLabel }).getAttribute('href'),
    ).toBe('/')
    expect(within(searchOf(header)).getByLabelText('test search')).toBeTruthy()
    expect(
      within(within(header).getByRole('navigation', { name: copy.shell.accountLabel })).getByText(
        'acct',
      ),
    ).toBeTruthy()
  })

  it('renders footer with the Open Library credit and every legal link', () => {
    renderShell()
    const footer = screen.getByRole('contentinfo')
    const credit = within(footer).getByRole('link', { name: copy.shell.openLibraryName })
    expect(credit.getAttribute('href')).toBe(copy.shell.openLibraryUrl)
    for (const link of copy.shell.legalLinks) {
      expect(within(footer).getByRole('link', { name: link.label }).getAttribute('href')).toBe(
        link.href,
      )
    }
  })

  it('uses a wrapping, padded layout that works from 360px up', () => {
    renderShell()
    const bar = screen.getByRole('banner').firstElementChild
    expect(bar?.className).toContain('flex-wrap')
    expect(bar?.className).toContain('px-4')
    // The search box drops to its own row on small screens and shares the row from md up.
    expect(searchOf(screen.getByRole('banner')).className).toContain('order-last')
    expect(screen.getByRole('main').className).toContain('max-w-page')
  })
})
