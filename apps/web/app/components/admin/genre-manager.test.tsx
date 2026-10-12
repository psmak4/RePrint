// @vitest-environment jsdom
import type { AdminGenre, AdminSubjectRule } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub, useLoaderData } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenreManager, genresTabFrom, orderGenres } from './genre-manager.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const genre = (n: number, over: Partial<AdminGenre> = {}): AdminGenre => ({
  id: id(n),
  slug: `genre-${n}`,
  name: `Genre ${n}`,
  description: null,
  parentId: null,
  featured: false,
  archived: false,
  bookCount: 4,
  ruleCount: 1,
  ...over,
})
const rule: AdminSubjectRule = {
  id: id(8),
  pattern: 'space opera',
  priority: 70,
  genre: { id: id(1), slug: 'genre-1', name: 'Genre 1' },
}
// Biography has a child, Memoir; Westerns is archived.
const family = [
  genre(1, { name: 'Fantasy', slug: 'fantasy' }),
  genre(2, { name: 'Westerns', slug: 'westerns', archived: true }),
  genre(3, { name: 'Biography', slug: 'biography' }),
  genre(4, { name: 'Memoir', slug: 'memoir', parentId: id(3) }),
]

function renderManager({
  action = () => ({ done: 'saved' }),
  genres = [genre(1), genre(2, { archived: true })],
  rules = [rule],
  tab = 'genres',
}: {
  action?: (body: unknown) => unknown
  genres?: AdminGenre[]
  rules?: AdminSubjectRule[]
  tab?: 'genres' | 'rules'
} = {}) {
  const Stub = createRoutesStub([
    {
      path: '/admin/catalog/genres',
      Component: () => <GenreManager genres={genres} rules={rules} tab={tab} />,
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/admin/catalog/genres']} />)
}

const table = () => screen.getByRole('table', { name: 'Genres' })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)

function openAddForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Add a Genre' }))
  return screen.getByRole('button', { name: 'Add Genre' }).closest('form') as HTMLElement
}

describe('GenreManager', () => {
  it('shows the title, the Add a Genre pill, and both tabs with counts', () => {
    renderManager()
    expect(screen.getByRole('heading', { level: 1, name: 'Genres and rules' })).toBeTruthy()
    const tabs = screen.getByRole('navigation', { name: 'Genres and rules sections' })
    expect(
      within(tabs)
        .getByRole('link', { name: /^Genres/ })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(tabs)
        .getByRole('link', { name: /^Subject rules/ })
        .getAttribute('href'),
    ).toBe('/admin/catalog/genres?tab=rules')
  })

  it('lists Genres with counts and children indented under their parent', () => {
    renderManager({ genres: family })
    expect(bodyRows().map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      expect.stringContaining('Biography'),
      expect.stringContaining('Memoir'),
      expect.stringContaining('Fantasy'),
    ])
    const memoir = bodyRows()[1] as HTMLElement
    expect(within(memoir).getByText('Biography')).toBeTruthy()
    expect(within(memoir).getAllByText('4').length).toBe(1)
  })

  it('finds a child Genre whose parent does not match', () => {
    renderManager({ genres: family })
    fireEvent.change(screen.getByLabelText('Find a Genre'), { target: { value: 'memo' } })
    expect(bodyRows()).toHaveLength(1)
    expect(within(bodyRows()[0] as HTMLElement).getByText('Memoir')).toBeTruthy()
  })

  it('hides archived Genres until Show archived is checked', () => {
    renderManager({ genres: family })
    expect(within(table()).queryByText('Westerns')).toBeNull()
    fireEvent.click(screen.getByLabelText('Show archived'))
    const westerns = bodyRows().find((row) => row.textContent?.includes('Westerns')) as HTMLElement
    expect(within(westerns).getByText('Archived')).toBeTruthy()
    expect(within(westerns).getByRole('button', { name: 'Restore Westerns' })).toBeTruthy()
  })

  it('opens the add form as a card from the band button and adds a Genre', async () => {
    const action = vi.fn(() => ({ done: 'created' }))
    renderManager({ action })
    expect(screen.queryByRole('region', { name: 'Add a Genre' })).toBeNull()
    const add = openAddForm()
    expect(screen.getByRole('region', { name: 'Add a Genre' })).toBeTruthy()
    fireEvent.change(within(add).getByLabelText('Name'), { target: { value: 'Horror' } })
    fireEvent.change(within(add).getByLabelText('Slug'), { target: { value: 'horror' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add Genre' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'createGenre',
        genre: { name: 'Horror', slug: 'horror', description: null, parentId: null },
      }),
    )
    expect(await within(add).findByText('The Genre was added.')).toBeTruthy()
  })

  it('drops the indent of a child whose archived parent is hidden', () => {
    renderManager({
      genres: [
        ...family,
        genre(6, { name: 'Cowboy Poetry', slug: 'cowboy-poetry', parentId: id(2) }),
      ],
    })
    const row = bodyRows().find((r) => r.textContent?.includes('Cowboy Poetry')) as HTMLElement
    const cell = within(row).getAllByRole('cell')[0]?.firstElementChild
    expect(cell?.className).not.toContain('pl-6')
    expect(within(row).getByText('Westerns')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Show archived'))
    const shown = bodyRows().find((r) => r.textContent?.includes('Cowboy Poetry')) as HTMLElement
    expect(within(shown).getAllByRole('cell')[0]?.firstElementChild?.className).toContain('pl-6')
  })

  it('moves to the add form and marks the band button as open', () => {
    renderManager()
    const open = screen.getByRole('button', { name: 'Add a Genre' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(open)
    expect(open.getAttribute('aria-expanded')).toBe('true')
    const card = screen.getByRole('region', { name: 'Add a Genre' })
    expect(open.getAttribute('aria-controls')).toBe(card.id)
    expect(document.activeElement).toBe(within(card).getByLabelText('Name'))
  })

  it('keeps Edit on an archived Genre, so it can be fixed without restoring it', () => {
    renderManager({ genres: family })
    fireEvent.click(screen.getByLabelText('Show archived'))
    expect(screen.getByRole('button', { name: 'Edit Westerns' })).toBeTruthy()
  })

  it('keeps a Genre archived just now in view with its message after the page reloads', async () => {
    const genres = [genre(1), genre(5, { name: 'Horror', slug: 'horror' })]
    const Stub = createRoutesStub([
      {
        path: '/admin/catalog/genres',
        // The real page reloads its data after every action; this loader does the same.
        loader: () => ({ genres: genres.map((g) => ({ ...g })) }),
        Component: () => {
          const data = useLoaderData() as { genres: AdminGenre[] }
          return <GenreManager genres={data.genres} rules={[]} tab="genres" />
        },
        action: async () => {
          const target = genres.find((g) => g.id === id(1))
          if (target) target.archived = true
          return { done: 'archived' }
        },
      },
    ])
    render(<Stub initialEntries={['/admin/catalog/genres']} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Genre 1' }))
    expect(await screen.findByText('The Genre was archived.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Restore Genre 1' })).toBeTruthy()
  })

  it('opens a row’s edit form in place and sends only the changed fields', async () => {
    const action = vi.fn(() => ({ done: 'saved' }))
    renderManager({ action })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Genre 1' }))
    const form = screen.getByRole('button', { name: 'Save Genre' }).closest('form') as HTMLElement
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Fiction' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save Genre' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'editGenre',
        genreId: id(1),
        changes: { name: 'Fiction' },
      }),
    )
  })

  it('archives and restores', async () => {
    const action = vi.fn(() => ({ done: 'archived', genreId: id(1) }))
    renderManager({ action })
    fireEvent.click(screen.getByRole('button', { name: 'Archive Genre 1' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'editGenre',
        genreId: id(1),
        changes: { archived: true },
      }),
    )
    expect(await screen.findByText('The Genre was archived.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Show archived'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore Genre 2' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'editGenre',
        genreId: id(2),
        changes: { archived: false },
      }),
    )
  })

  it('shows field errors from the API', async () => {
    renderManager({ action: () => ({ fieldErrors: { slug: 'That slug is taken.' } }) })
    const add = openAddForm()
    fireEvent.change(within(add).getByLabelText('Name'), { target: { value: 'Horror' } })
    fireEvent.change(within(add).getByLabelText('Slug'), { target: { value: 'horror' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add Genre' }))
    expect((await within(add).findByRole('alert')).textContent).toBe('That slug is taken.')
  })

  it('shows the rules table and the add form on the rules tab only', () => {
    renderManager({ tab: 'rules' })
    expect(screen.getByRole('table', { name: 'Subject rules' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Genres' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a Genre' })).toBeNull()
  })

  it('adds a rule with its priority, offering only live Genres', async () => {
    const action = vi.fn(() => ({ done: 'ruleAdded' }))
    renderManager({ action, tab: 'rules' })
    const form = screen.getByRole('button', { name: 'Add rule' }).closest('form') as HTMLElement
    expect(within(form).queryByRole('option', { name: 'Genre 2' })).toBeNull()
    fireEvent.change(within(form).getByLabelText('Pattern'), { target: { value: 'cyberpunk' } })
    fireEvent.change(within(form).getByLabelText('Priority (0 to 1000)'), {
      target: { value: '90' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Add rule' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'addRule',
        rule: { pattern: 'cyberpunk', genreId: id(1), priority: 90 },
      }),
    )
  })

  it('removes a rule', async () => {
    const action = vi.fn(() => ({ done: 'ruleRemoved' }))
    renderManager({ action, tab: 'rules' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule space opera' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ intent: 'removeRule', ruleId: id(8) }),
    )
    expect(await screen.findByText('The rule was removed.')).toBeTruthy()
  })

  it('has no serious or critical axe issues on either tab', async () => {
    for (const tab of ['genres', 'rules'] as const) {
      const { container, unmount } = renderManager({ genres: family, tab })
      const results = await axe.run(container)
      expect(
        results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      ).toEqual([])
      unmount()
    }
  })
})

describe('genre helpers', () => {
  it('reads the tab from the URL, Genres by default', () => {
    expect(genresTabFrom(new URLSearchParams('tab=rules'))).toBe('rules')
    expect(genresTabFrom(new URLSearchParams('tab=nope'))).toBe('genres')
    expect(genresTabFrom(new URLSearchParams())).toBe('genres')
  })

  it('orders parents by name, each followed by its children', () => {
    expect(orderGenres(family).map((g) => g.name)).toEqual([
      'Biography',
      'Memoir',
      'Fantasy',
      'Westerns',
    ])
  })
})
