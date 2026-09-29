// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, data } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { ForgotPasswordPage } from './forgot-password-page.js'
import { ResetPasswordPage } from './reset-password-page.js'
import { VerificationBanner } from './verification-banner.js'
import { VerifyEmailPage } from './verify-email-page.js'

afterEach(cleanup)

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

function stub(
  path: string,
  Component: () => React.ReactElement,
  action: (body: unknown) => unknown,
) {
  const Stub = createRoutesStub([
    { path, Component, action: async ({ request }) => action(await request.json()) },
  ])
  return render(<Stub initialEntries={[path]} />)
}

describe('VerifyEmailPage', () => {
  it('shows success', () => {
    render(<VerifyEmailPage verified signedIn />)
    expect(screen.getByRole('heading', { name: copy.auth.verify.successTitle })).toBeTruthy()
  })

  it('shows a clear expired or used state', () => {
    render(<VerifyEmailPage verified={false} signedIn={false} />)
    expect(screen.getByRole('heading', { name: copy.auth.verify.failedTitle })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(copy.auth.verify.failedBody)
  })
})

describe('VerificationBanner', () => {
  it('renders nothing for verified Members', () => {
    const Stub = createRoutesStub([{ path: '/', Component: () => <VerificationBanner verified /> }])
    const { container } = render(<Stub />)
    expect(container.textContent).toBe('')
  })

  it('resends the link and confirms', async () => {
    const resend = vi.fn(() => ({ sent: true }))
    const Stub = createRoutesStub([
      { path: '/', Component: () => <VerificationBanner verified={false} /> },
      { path: '/resend-verification', action: resend },
    ])
    render(<Stub />)
    expect(screen.getByText(copy.auth.banner.message)).toBeTruthy()
    click(copy.auth.banner.resend)
    expect(await screen.findByText(copy.auth.banner.sent)).toBeTruthy()
    expect(resend).toHaveBeenCalled()
  })

  it('says so when sending fails', async () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <VerificationBanner verified={false} /> },
      { path: '/resend-verification', action: () => data({ sent: false }, { status: 429 }) },
    ])
    render(<Stub />)
    click(copy.auth.banner.resend)
    expect(await screen.findByText(copy.auth.banner.failed)).toBeTruthy()
  })
})

describe('ForgotPasswordPage', () => {
  it('shows the same confirmation whatever the email', async () => {
    const action = vi.fn(() => ({ status: 'check_your_email' }))
    stub('/forgot-password', ForgotPasswordPage, action)
    type(copy.auth.emailLabel, 'nobody@example.com')
    click(copy.auth.forgot.submit)
    expect(
      await screen.findByRole('heading', { name: copy.auth.forgot.checkEmailTitle }),
    ).toBeTruthy()
    expect(action).toHaveBeenCalledWith({ email: 'nobody@example.com' })
  })

  it('validates the email first', async () => {
    const action = vi.fn(() => null)
    stub('/forgot-password', ForgotPasswordPage, action)
    click(copy.auth.forgot.submit)
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage', () => {
  it('sends the token with the new password and shows success', async () => {
    const action = vi.fn(() => ({ status: 'password_reset' }))
    stub('/reset-password', () => <ResetPasswordPage token="tok123" />, action)
    type(copy.auth.reset.newPasswordLabel, 'a brand new passphrase')
    click(copy.auth.reset.submit)
    expect(await screen.findByRole('heading', { name: copy.auth.reset.doneTitle })).toBeTruthy()
    expect(action).toHaveBeenCalledWith({ token: 'tok123', password: 'a brand new passphrase' })
  })

  it('shows an expired-token message with a way to request a new link', async () => {
    stub(
      '/reset-password',
      () => <ResetPasswordPage token="old" />,
      () => data({ formError: copy.auth.reset.invalidBody }, { status: 400 }),
    )
    type(copy.auth.reset.newPasswordLabel, 'a brand new passphrase')
    click(copy.auth.reset.submit)
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(copy.auth.reset.invalidBody),
    )
    expect(screen.getByRole('link', { name: copy.auth.reset.requestNew })).toBeTruthy()
  })

  it('handles a missing token', () => {
    stub(
      '/reset-password',
      () => <ResetPasswordPage token="" />,
      () => null,
    )
    expect(screen.getByRole('heading', { name: copy.auth.reset.invalidTitle })).toBeTruthy()
  })
})
