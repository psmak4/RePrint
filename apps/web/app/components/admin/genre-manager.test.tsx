// @vitest-environment jsdom
import type { AdminGenre, AdminSubjectRule } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenreManager } from './genre-manager.js'

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

function renderManager(
  action: (body: unknown) => unknown = () => ({ done: 'saved' }),
  genres = [genre(1), genre(2, { archived: true })],
  rules = [rule],
) {
  const Stub = createRoutesStub([
    {
      path: '/admin/catalog/genres',
      Component: () => <GenreManager genres={genres} rules={rules} />,
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/admin/catalog/genres']} />)
}

describe('GenreManager', () => {
  it('lists Genres with counts and marks archived ones', () => {
    renderManager()
    const list = screen.getByRole('list', { name: 'Genres' })
    const items = within(list).getAllByRole('listitem')
    expect(within(items[0] as HTMLElement).getByText(/4 Books · 1 rule/)).toBeTruthy()
    expect(within(items[1] as HTMLElement).getByText('Archived')).toBeTruthy()
    expect(
      within(items[1] as HTMLElement).getByRole('button', { name: 'Restore Genre 2' }),
    ).toBeTruthy()
  })

  it('adds a Genre', async () => {
    const action = vi.fn(() => ({ done: 'created' }))
    renderManager(action)
    const add = screen.getByRole('button', { name: 'Add Genre' }).closest('form') as HTMLElement
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

  it('sends only the changed fields when editing', async () => {
    const action = vi.fn(() => ({ done: 'saved' }))
    renderManager(action)
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
    renderManager(action)
    fireEvent.click(screen.getByRole('button', { name: 'Archive Genre 1' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'editGenre',
        genreId: id(1),
        changes: { archived: true },
      }),
    )
    expect(await screen.findByText('The Genre was archived.')).toBeTruthy()
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
    renderManager(() => ({ fieldErrors: { slug: 'That slug is taken.' } }))
    const add = screen.getByRole('button', { name: 'Add Genre' }).closest('form') as HTMLElement
    fireEvent.change(within(add).getByLabelText('Name'), { target: { value: 'Horror' } })
    fireEvent.change(within(add).getByLabelText('Slug'), { target: { value: 'horror' } })
    fireEvent.click(within(add).getByRole('button', { name: 'Add Genre' }))
    expect((await within(add).findByRole('alert')).textContent).toBe('That slug is taken.')
  })

  it('adds a rule with its priority, offering only live Genres', async () => {
    const action = vi.fn(() => ({ done: 'ruleAdded' }))
    renderManager(action)
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
    renderManager(action)
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule space opera' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ intent: 'removeRule', ruleId: id(8) }),
    )
    expect(await screen.findByText('The rule was removed.')).toBeTruthy()
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderManager()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
