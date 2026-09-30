// @vitest-environment jsdom
import type { SearchSuggestResponse } from '@reprint/shared'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { SearchBox, SUGGEST_DELAY_MS } from './search-box.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const suggestions: SearchSuggestResponse = {
  books: [
    {
      id: '0198a000-0000-7000-8000-000000000001',
      slug: 'dune',
      title: 'Dune',
      subtitle: null,
      cover: null,
      firstPublishedYear: 1965,
      contributions: [
        {
          author: {
            id: '0198a000-0000-7000-8000-000000000002',
            slug: 'frank-herbert',
            name: 'Frank Herbert',
          },
          role: 'author',
          position: 0,
        },
      ],
      rating: { average: null, count: 0, distribution: [0, 0, 0, 0, 0] },
    },
  ],
  authors: [
    { id: '0198a000-0000-7000-8000-000000000002', slug: 'frank-herbert', name: 'Frank Herbert' },
  ],
}

function renderBox(suggest = vi.fn(async () => suggestions)) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <SearchBox suggest={suggest} /> },
    { path: '/books/:slug', Component: () => <p>Book page</p> },
    { path: '/authors/:slug', Component: () => <p>Author page</p> },
  ])
  render(<Stub initialEntries={['/']} />)
  return { suggest, input: screen.getByRole('combobox', { name: copy.shell.search.inputLabel }) }
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS)
  })
}

describe('SearchBox', () => {
  it('suggests nothing for fewer than 2 characters', async () => {
    const { suggest, input } = renderBox()
    await type(input, 'd')
    expect(suggest).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('asks 250 ms after the last keystroke, once', async () => {
    const { suggest, input } = renderBox()
    fireEvent.change(input, { target: { value: 'du' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS - 1)
    })
    fireEvent.change(input, { target: { value: 'dun' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DELAY_MS - 1)
    })
    expect(suggest).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(suggest).toHaveBeenCalledTimes(1)
    expect(suggest).toHaveBeenCalledWith('dun', expect.any(AbortSignal))
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe(copy.shell.search.resultCount(2))
  })

  it('moves through options with the arrow keys and wraps back to the input', async () => {
    const { input } = renderBox()
    await type(input, 'dune')
    const options = screen.getAllByRole('option')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id)
  })

  it('opens the active suggestion on Enter', async () => {
    const { input } = renderBox()
    await type(input, 'dune')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await flush()
    expect(screen.getByText('Book page')).toBeTruthy()
  })

  it('opens an Author suggestion on click', async () => {
    const { input } = renderBox()
    await type(input, 'frank')
    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement)
    await flush()
    expect(screen.getByText('Author page')).toBeTruthy()
  })

  it('closes the list on Escape', async () => {
    const { input } = renderBox()
    await type(input, 'dune')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('submits a plain search to /search?q= when no suggestion is active', async () => {
    const { input } = renderBox()
    await type(input, 'dune')
    const form = input.closest('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('/search')
    expect(form.method).toBe('get')
    expect(input.getAttribute('name')).toBe('q')
    const enter = fireEvent.keyDown(input, { key: 'Enter' })
    expect(enter).toBe(true)
  })

  it('stays a plain search field when suggestions fail', async () => {
    const { input } = renderBox(vi.fn(async () => Promise.reject(new Error('down'))))
    await type(input, 'dune')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })
})
