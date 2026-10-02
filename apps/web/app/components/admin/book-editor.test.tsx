// @vitest-environment jsdom
import type { AdminBookDetail, AdminGenre } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookEditor } from './book-editor.js'

// jsdom's File can't be turned into a Request under vitest (its FormData shim fails on any Blob),
// so the Cover upload is recorded here and replayed without the file.
const submitted: unknown[] = []
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useFetcher: (...args: Parameters<typeof actual.useFetcher>) => {
      const fetcher = actual.useFetcher(...args)
      return {
        ...fetcher,
        submit: (target: unknown, options: Record<string, unknown>) => {
          submitted.push(target)
          const replay = target instanceof FormData ? new URLSearchParams() : target
          return fetcher.submit(replay as never, options as never)
        },
      }
    },
  }
})

afterEach(() => {
  cleanup()
  submitted.length = 0
})

const id = '0192a3b4-0000-7000-8000-000000000001'
const editionId = '0192a3b4-0000-7000-8000-000000000003'
const genres: AdminGenre[] = ['Fantasy', 'Science fiction'].map((name, i) => ({
  id: `0192a3b4-0000-7000-8000-00000000010${i}`,
  slug: name.toLowerCase().replace(' ', '-'),
  name,
  description: null,
  parentId: null,
  featured: false,
  archived: false,
  bookCount: 0,
  ruleCount: 0,
}))
const base: AdminBookDetail = {
  id,
  slug: 'dune-0192',
  title: 'Dune',
  description: 'Sand.',
  genres: [{ id: genres[1]?.id ?? '', slug: 'science-fiction', name: 'Science fiction' }],
  series: [],
  contributions: [{ authorId: id, name: 'Frank Herbert', role: 'author', position: 0 }],
  cover: null,
  primaryEditionId: null,
  lockedFields: ['title'],
  fieldOrigins: { title: { source: 'admin', at: '2026-10-01T00:00:00.000Z' } },
  editions: [
    {
      id: editionId,
      isbn13: '9780441013593',
      format: 'paperback',
      language: 'en',
      publisherName: 'Ace',
      publishedDate: '2005-08-02',
    },
  ],
}

function renderEditor(action: (body: unknown) => unknown = () => ({ done: 'edit', book: base })) {
  const Stub = createRoutesStub([
    {
      path: '/admin/books/:id',
      Component: () => <BookEditor book={base} genres={genres} />,
      action: async ({ request }) =>
        request.headers.get('content-type')?.startsWith('multipart/form-data')
          ? action({ upload: true })
          : action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={[`/admin/books/${id}`]} />)
}

describe('BookEditor', () => {
  it('shows locked fields with their origin', () => {
    renderEditor()
    expect(screen.getByText('Locked')).toBeTruthy()
    expect(screen.getAllByText(/Set by admin on Oct 1, 2026/).length).toBeGreaterThan(0)
  })

  it('sends only the fields that changed', async () => {
    const action = vi.fn(() => ({ done: 'edit', book: base }))
    renderEditor(action)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Dune Messiah' } })
    fireEvent.click(screen.getByLabelText('Fantasy'))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action).toHaveBeenCalledWith({
      intent: 'edit',
      changes: { title: 'Dune Messiah', genreIds: [genres[1]?.id, genres[0]?.id] },
    })
    expect(await screen.findByText(/Edited fields are now locked/)).toBeTruthy()
  })

  it('sends a chosen Primary Edition and new Series and contribution rows', async () => {
    const action = vi.fn(() => ({ done: 'edit', book: base }))
    renderEditor(action)
    fireEvent.change(screen.getByLabelText('Primary Edition'), { target: { value: editionId } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a Series' }))
    fireEvent.change(screen.getByLabelText('Series name'), { target: { value: 'Dune' } })
    fireEvent.change(screen.getByLabelText(/Position/), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a contribution' }))
    const names = screen.getAllByLabelText('Author name')
    fireEvent.change(names[1] as HTMLElement, { target: { value: 'Brian Herbert' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action).toHaveBeenCalledWith({
      intent: 'edit',
      changes: {
        series: [{ name: 'Dune', position: 2.5 }],
        contributions: [
          { authorId: id, role: 'author' },
          { name: 'Brian Herbert', role: 'author' },
        ],
        primaryEditionId: editionId,
      },
    })
  })

  it('does not call the API when nothing changed', async () => {
    const action = vi.fn()
    renderEditor(action)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Change a field first.')).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it('uploads a Cover', async () => {
    const action = vi.fn(() => ({ done: 'cover', book: base }))
    renderEditor(action)
    const file = new File(['x'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Upload a Cover image'), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload Cover' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ upload: true }))
    expect((submitted[0] as FormData).get('file')).toBe(file)
    expect(await screen.findByText('The Cover was uploaded and locked.')).toBeTruthy()
  })

  it('triggers a refresh', async () => {
    const action = vi.fn(() => ({ done: 'refresh' }))
    renderEditor(action)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
    await waitFor(() => expect(action).toHaveBeenCalledWith({ intent: 'refresh' }))
    expect(await screen.findByText(/A refresh was queued/)).toBeTruthy()
  })

  it('shows a failure from the API', async () => {
    renderEditor(() => ({ formError: 'Nope.' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Nope.')).toBeTruthy()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderEditor()
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
