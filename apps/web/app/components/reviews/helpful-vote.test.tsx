// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpfulVote } from './helpful-vote.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const reviewId = '0192a3b4-0000-7000-8000-000000000001'

function renderVote(props: Partial<React.ComponentProps<typeof HelpfulVote>> = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <HelpfulVote reviewId={reviewId} count={2} voted={false} canVote {...props} />
    </QueryClientProvider>,
  )
}

describe('HelpfulVote', () => {
  it('shows the count text and hides the button when the viewer cannot vote', async () => {
    const { container } = renderVote({ canVote: false })
    expect(screen.getByText('2 people found this helpful')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect((await axe.run(container)).violations).toEqual([])
  })

  it('shows nothing for a review without votes when the viewer cannot vote', () => {
    const { container } = renderVote({ canVote: false, count: 0 })
    expect(container.textContent).toBe('')
  })

  it('updates the count at once, then keeps the server count', async () => {
    let finish: (response: Response) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderVote()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as helpful' }))

    expect(await screen.findByText('3 people found this helpful')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Marked as helpful' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(fetchMock).toHaveBeenCalledWith(`/reviews/${reviewId}/helpful`, { method: 'POST' })

    finish(Response.json({ helpful: true, helpfulCount: 4 }))
    await waitFor(() => expect(screen.getByText('4 people found this helpful')).toBeTruthy())
  })

  it('removes a vote with DELETE', async () => {
    const fetchMock = vi.fn(async () => Response.json({ helpful: false, helpfulCount: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    renderVote({ voted: true })
    fireEvent.click(screen.getByRole('button', { name: 'Marked as helpful' }))
    await waitFor(() => expect(screen.getByText('1 person found this helpful')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith(`/reviews/${reviewId}/helpful`, { method: 'DELETE' })
    expect(screen.getByRole('button', { name: 'Mark as helpful' })).toBeTruthy()
  })

  it('rolls back and says so when the vote fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    )
    renderVote()
    fireEvent.click(screen.getByRole('button', { name: 'Mark as helpful' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('2 people found this helpful')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Mark as helpful' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })
})
