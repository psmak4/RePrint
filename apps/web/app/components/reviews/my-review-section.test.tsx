// @vitest-environment jsdom
import type { Edition, MyReview, Viewer } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyReviewSection } from './my-review-section.js'

afterEach(() => {
  cleanup()
  window.plausible = undefined
})

const id = '0192a3b4-0000-7000-8000-000000000001'
const viewer: Viewer = { id, username: 'ada', displayName: 'Ada', verified: true, permissions: [] }
const edition: Edition = {
  id,
  bookId: id,
  isbn13: null,
  format: 'audiobook',
  language: 'en',
  title: null,
  publisherName: 'Audible',
  publishedDate: '2020-01-01',
  pageCount: null,
  cover: null,
}
const review: MyReview = {
  id,
  rating: 4,
  headline: 'Great',
  body: 'x'.repeat(60),
  hasSpoilers: false,
  editionId: null,
  status: 'pending',
  rejectionReason: null,
  submittedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const GOOD_BODY = 'A thoughtful, well paced book that kept me reading until the very end.'

type ActionResult = Record<string, unknown>

function renderSection(
  props: { viewer: Viewer | null; myReview?: MyReview | null; editions?: Edition[] },
  action: (body: Record<string, unknown>) => ActionResult = () => ({ saved: true }),
) {
  const calls: Record<string, unknown>[] = []
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <MyReviewSection
          viewer={props.viewer}
          myReview={props.myReview ?? null}
          editions={props.editions ?? [edition]}
        />
      ),
      action: async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        calls.push(body)
        return action(body)
      },
    },
  ])
  render(<Stub />)
  return calls
}

async function fillValidForm() {
  fireEvent.click(await screen.findByRole('radio', { name: '5 stars' }))
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: GOOD_BODY } })
}

describe('write a review', () => {
  it('offers "Write a review" and opens the form with counters', async () => {
    renderSection({ viewer })
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    expect(await screen.findByRole('radiogroup', { name: 'Your rating' })).toBeTruthy()
    expect(screen.getByText('0 of 120 characters')).toBeTruthy()
    expect(screen.getByText('0 of 10000 characters (at least 50 needed)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Headline (optional)'), { target: { value: 'Hey' } })
    expect(screen.getByText('3 of 120 characters')).toBeTruthy()
  })

  it('validates with the shared schema before sending', async () => {
    const calls = renderSection({ viewer })
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    fireEvent.change(await screen.findByLabelText('Your review'), {
      target: { value: 'too short' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('Choose a rating from 1 to 5 stars.')).toBeTruthy()
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2)
    expect(calls).toHaveLength(0)
  })

  it('submits rating, body, spoilers, and the Edition read', async () => {
    const calls = renderSection({ viewer })
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    await fillValidForm()
    fireEvent.click(screen.getByLabelText('This review contains spoilers'))
    fireEvent.change(screen.getByLabelText('Edition you read (optional)'), {
      target: { value: id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({
      intent: 'save',
      rating: 5,
      body: GOOD_BODY,
      hasSpoilers: true,
      editionId: id,
    })
  })

  it('tracks a submitted review, and nothing when the server rejects it', async () => {
    const tracker = vi.fn()
    window.plausible = tracker
    renderSection({ viewer }, () => ({ formError: 'Too many reviews today.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    await screen.findByText('Too many reviews today.')
    expect(tracker).not.toHaveBeenCalled()
    cleanup()
    const calls = renderSection({ viewer })
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    await waitFor(() => expect(tracker).toHaveBeenCalledWith('Review Submitted', undefined))
  })

  it('shows server errors on the field and for the whole form', async () => {
    renderSection({ viewer }, () => ({ fieldErrors: { body: 'Server says the body is bad.' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('Server says the body is bad.')).toBeTruthy()
    cleanup()
    renderSection({ viewer }, () => ({ formError: 'Too many reviews today.' }))
    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    expect(await screen.findByText('Too many reviews today.')).toBeTruthy()
  })

  it('shows a verify prompt instead of the form to unverified Members', () => {
    renderSection({ viewer: { ...viewer, verified: false } })
    expect(screen.getByText('Confirm your email address to write a review.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Write a review' })).toBeNull()
  })

  it('asks Visitors to log in', () => {
    renderSection({ viewer: null })
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
  })
})

describe('my review', () => {
  it('shows the review with its status', () => {
    renderSection({ viewer, myReview: review })
    expect(screen.getByRole('heading', { name: 'Your review' })).toBeTruthy()
    expect(screen.getByText('Pending approval')).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 stars' })).toBeTruthy()
    expect(screen.getByText('Great')).toBeTruthy()
  })

  it('shows the reason on a rejected review and lets it be edited and resubmitted', async () => {
    const calls = renderSection({
      viewer,
      myReview: { ...review, status: 'rejected', rejectionReason: 'Please remove the insults.' },
    })
    expect(screen.getByText("Moderator's reason: Please remove the insults.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }))
    expect(await screen.findByDisplayValue('Great')).toBeTruthy()
    expect((screen.getByRole('radio', { name: '4 stars' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit for approval' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ intent: 'save', rating: 4, headline: 'Great' })
  })

  it('hides a spoiler review behind the toggle', () => {
    renderSection({ viewer, myReview: { ...review, hasSpoilers: true } })
    expect(screen.queryByText(review.body)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show spoilers' }))
    expect(screen.getByText(review.body)).toBeTruthy()
  })

  it('asks for confirmation before deleting, then deletes', async () => {
    const calls = renderSection({ viewer, myReview: review }, () => ({ deleted: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete review' }))
    expect(screen.getByText(/cannot be undone/)).toBeTruthy()
    expect(calls).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByText(/cannot be undone/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
    await waitFor(() => expect(calls).toEqual([{ intent: 'delete' }]))
  })

  it('lets an unverified Member remove a review but not edit it', () => {
    renderSection({ viewer: { ...viewer, verified: false }, myReview: review })
    expect(screen.queryByRole('button', { name: 'Edit your review' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete review' })).toBeTruthy()
  })
})
