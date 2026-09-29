// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, data } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { LoginPage } from './login-page.js'
import { RegisterPage } from './register-page.js'

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
    {
      path,
      Component,
      action: async ({ request }) => action(await request.json()),
    },
  ])
  return render(<Stub initialEntries={[path]} />)
}

describe('LoginPage', () => {
  it('validates with the shared schema before submitting', async () => {
    const action = vi.fn(() => null)
    stub('/login', LoginPage, action)
    click(copy.auth.login.submit)
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
    expect(action).not.toHaveBeenCalled()
  })

  it('posts the credentials and shows the server message', async () => {
    const action = vi.fn(() =>
      data({ formError: 'The email or password is incorrect.' }, { status: 401 }),
    )
    stub('/login', LoginPage, action)
    type(copy.auth.emailLabel, 'ada@example.com')
    type(copy.auth.passwordLabel, 'wrong')
    click(copy.auth.login.submit)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The email or password is incorrect.',
    )
    expect(action).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'wrong' })
  })

  it('links to registration and password reset', () => {
    stub('/login', LoginPage, () => null)
    expect(
      screen.getByRole('link', { name: copy.auth.login.forgotLink }).getAttribute('href'),
    ).toBe('/forgot-password')
    expect(
      screen.getByRole('link', { name: copy.auth.login.registerLink }).getAttribute('href'),
    ).toBe('/register')
  })
})

describe('RegisterPage', () => {
  const fill = async (invite?: string) => {
    type(copy.auth.emailLabel, 'ada@example.com')
    type(copy.auth.usernameLabel, 'ada_l')
    type(copy.auth.passwordLabel, 'correct horse battery')
    if (invite) type(copy.auth.inviteCodeLabel, invite)
    click(copy.auth.register.submit)
  }

  it('hides the invite code field when signups are open', () => {
    stub(
      '/register',
      () => <RegisterPage signupsOpen />,
      () => null,
    )
    expect(screen.queryByLabelText(copy.auth.inviteCodeLabel)).toBeNull()
  })

  it('shows and requires the invite code when signups are closed', async () => {
    const action = vi.fn(() => ({ status: 'check_your_email' }))
    stub('/register', () => <RegisterPage signupsOpen={false} />, action)
    click(copy.auth.register.submit)
    expect(await screen.findByText(copy.auth.inviteCodeRequired)).toBeTruthy()
    await fill('local-beta')
    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(action).toHaveBeenCalledWith({
      email: 'ada@example.com',
      username: 'ada_l',
      password: 'correct horse battery',
      inviteCode: 'local-beta',
    })
  })

  it('shows server field errors next to the field', async () => {
    stub(
      '/register',
      () => <RegisterPage signupsOpen />,
      () => data({ fieldErrors: { username: 'That username is taken.' } }, { status: 400 }),
    )
    await fill()
    const message = await screen.findByText('That username is taken.')
    const input = screen.getByLabelText(copy.auth.usernameLabel)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain(message.id)
  })

  it('shows the check-your-email state on success', async () => {
    stub(
      '/register',
      () => <RegisterPage signupsOpen />,
      () => ({ status: 'check_your_email' }),
    )
    await fill()
    expect(
      await screen.findByRole('heading', { name: copy.auth.register.checkEmailTitle }),
    ).toBeTruthy()
  })
})
