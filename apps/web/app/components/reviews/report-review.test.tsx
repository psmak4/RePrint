// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportReview } from './report-review.js'

afterEach(cleanup)

const reviewId = '0192a3b4-0000-7000-8000-000000000001'

function renderReport(action: (body: unknown) => unknown = () => ({ status: 'report_received' })) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <ReportReview reviewId={reviewId} /> },
    {
      path: '/reviews/:id/report',
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={['/']} />)
}

describe('ReportReview', () => {
  it('offers the five reasons', () => {
    renderReport()
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    const labels = screen.getAllByRole('radio').map((radio) => radio.parentElement?.textContent)
    expect(labels).toEqual([
      'Unmarked spoiler',
      'Offensive or hateful',
      'Spam or advertising',
      'Off-topic',
      'Other',
    ])
  })

  it('sends the reason and confirms', async () => {
    const action = vi.fn(() => ({ status: 'report_received' }))
    renderReport(action)
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    fireEvent.click(screen.getByLabelText('Spam or advertising'))
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(await screen.findByText('Thank you. The moderators will take a look.')).toBeTruthy()
    expect(action).toHaveBeenCalledWith({ reason: 'spam' })
  })

  it('requires a note for "other" and sends nothing without one', async () => {
    const action = vi.fn(() => ({ status: 'report_received' }))
    renderReport(action)
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    fireEvent.click(screen.getByLabelText('Other'))
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).required).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(action).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Quotes a stranger' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ reason: 'other', note: 'Quotes a stranger' }),
    )
  })

  it('shows the server refusal', async () => {
    renderReport(() =>
      Response.json({ formError: 'You already reported this review.' }, { status: 409 }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect((await screen.findByRole('alert')).textContent).toBe('You already reported this review.')
  })

  it('has no serious or critical axe issues with the dialog open', async () => {
    const { container } = renderReport()
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    const results = await axe.run(container)
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })
})
