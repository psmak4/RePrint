// @vitest-environment jsdom
import type { AdminMergeCandidate } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MergeQueue } from './merge-queue.js'

afterEach(cleanup)

const id = (n: number) => `0192a3b4-0000-7000-8000-00000000000${n}`
const book = (n: number, title: string) => ({
  id: id(n),
  slug: `book-${n}`,
  title,
  authors: ['Frank Herbert'],
  editionCount: n,
  reviewCount: 2,
  shelfEntryCount: 1,
  cover: null,
})
const candidate: AdminMergeCandidate = {
  id: id(9),
  reason: 'Same title and Author',
  createdAt: '2026-10-01T00:00:00.000Z',
  bookA: book(1, 'Dune'),
  bookB: book(2, 'Dune (Deluxe)'),
}

function renderQueue(
  items: AdminMergeCandidate[] = [candidate],
  action: (body: unknown) => unknown = () => ({ done: 'dismissed', candidateId: id(9) }),
  nextCursor: string | null = null,
) {
  const Stub = createRoutesStub([
    {
      path: '/admin/catalog/merge',
      Component: () => <MergeQueue queue={{ items, meta: { nextCursor } }} />,
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/admin/catalog/merge']} />)
}

describe('MergeQueue', () => {
  it('shows both Books of a pair side by side with edit links', () => {
    renderQueue()
    const pair = screen.getByRole('article')
    expect(within(pair).getByText('Same title and Author', { exact: false })).toBeTruthy()
    expect(within(pair).getByRole('link', { name: 'Dune' })).toBeTruthy()
    expect(within(pair).getByRole('link', { name: 'Dune (Deluxe)' })).toBeTruthy()
    expect(within(pair).getByRole('link', { name: 'Edit Dune' }).getAttribute('href')).toBe(
      `/admin/books/${id(1)}`,
    )
  })

  it('says so when no pairs are waiting', () => {
    renderQueue([])
    expect(screen.getByText('No possible duplicates are waiting.')).toBeTruthy()
  })

  it('merges only after confirmation, into the Book that is kept', async () => {
    const action = vi.fn(() => ({
      done: 'merged',
      candidateId: id(9),
      moved: { reviews: 3, shelfEntries: 1, editions: 2 },
    }))
    renderQueue([candidate], action)
    fireEvent.click(screen.getByRole('button', { name: 'Keep Dune' }))
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByText('Merge Dune (Deluxe) into Dune?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Merge Books' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        intent: 'merge',
        candidateId: id(9),
        merge: { fromBookId: id(2), intoBookId: id(1) },
      }),
    )
    expect(await screen.findByText(/The Books were merged/)).toBeTruthy()
  })

  it('can back out of a merge', () => {
    renderQueue()
    fireEvent.click(screen.getByRole('button', { name: 'Keep Dune' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Merge Books' })).toBeNull()
  })

  it('dismisses a pair', async () => {
    const action = vi.fn(() => ({ done: 'dismissed', candidateId: id(9) }))
    renderQueue([candidate], action)
    fireEvent.click(screen.getByRole('button', { name: 'Not a duplicate' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ intent: 'dismiss', candidateId: id(9) }),
    )
    expect(await screen.findByText('The pair was dismissed.')).toBeTruthy()
  })

  it('shows the API problem when a merge is refused', async () => {
    renderQueue([candidate], () => ({ formError: 'A Member reviewed both Books.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep Dune' }))
    fireEvent.click(screen.getByRole('button', { name: 'Merge Books' }))
    expect((await screen.findByRole('alert')).textContent).toBe('A Member reviewed both Books.')
  })

  it('links to the next page', () => {
    renderQueue([candidate], undefined, 'abc')
    expect(screen.getByRole('link', { name: 'Show more' }).getAttribute('href')).toBe(
      '/admin/catalog/merge?cursor=abc',
    )
  })

  it('has no serious or critical axe issues', async () => {
    const { container } = renderQueue()
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
