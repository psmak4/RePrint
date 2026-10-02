// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShelfSelector } from './shelf-selector.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ref = 'a'.repeat(22)

function renderSelector(props: Partial<React.ComponentProps<typeof ShelfSelector>> = {}) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <ShelfSelector
          target={{ kind: 'book', slug: 'dune' }}
          title="Dune"
          signedIn
          shelf={null}
          {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

const optionLabels = () => screen.getAllByRole('option').map((option) => option.textContent)

describe('ShelfSelector', () => {
  it('offers the three shelves, and "Remove" only once the Book is shelved', async () => {
    const { container } = renderSelector()
    expect(optionLabels()).toEqual(['Add to shelf', 'Want to Read', 'Reading', 'Read'])
    expect((await axe.run(container)).violations).toEqual([])
    cleanup()
    renderSelector({ shelf: 'reading' })
    expect(optionLabels()).toEqual(['Want to Read', 'Reading', 'Read', 'Remove'])
    expect(
      (screen.getByRole('combobox', { name: 'Shelf for Dune' }) as HTMLSelectElement).value,
    ).toBe('reading')
  })

  it('puts the Book on the chosen shelf and shows it', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ shelf: 'read' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderSelector()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'read' } })
    await waitFor(() =>
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('read'),
    )
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('/books/dune/shelf')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({ shelf: 'read' })
  })

  it('removes the Book from its shelf', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ shelf: null }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderSelector({ shelf: 'want_to_read' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remove' } })
    await waitFor(() => expect(optionLabels()[0]).toBe('Add to shelf'))
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('stores a not-yet-on-RePrint result first, then shelves it', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url === '/resolve'
        ? Response.json({ slug: 'emma-0a1b2c' })
        : Response.json({ shelf: 'reading' }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderSelector({ target: { kind: 'candidate', ref }, title: 'Emma' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reading' } })
    await waitFor(() =>
      expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('reading'),
    )
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/resolve',
      '/books/emma-0a1b2c/shelf',
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ ref })

    // The Book is stored now, so a second change does not resolve it again.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'read' } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/books/emma-0a1b2c/shelf')
  })

  it('keeps the old shelf and says so when the change fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    renderSelector({ shelf: 'reading' })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'read' } })
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't update your shelf")
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('reading')
  })

  it('asks a Visitor to sign in instead of showing the control', async () => {
    const { container } = renderSelector({ signedIn: false })
    expect(screen.queryByRole('combobox')).toBeNull()
    const link = within(container).getByRole('link', { name: 'Sign in to shelve' })
    expect(link.getAttribute('href')).toBe('/login')
    expect((await axe.run(container)).violations).toEqual([])
  })
})
