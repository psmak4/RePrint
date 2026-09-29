// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../../copy/index.js'
import { AccountMenu } from './account-menu.js'

afterEach(cleanup)

const viewer = {
  id: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
  username: 'ada',
  displayName: 'Ada',
  verified: true,
  permissions: [],
}

function renderMenu(v: typeof viewer | null) {
  const Stub = createRoutesStub([{ path: '/', Component: () => <AccountMenu viewer={v} /> }])
  return render(<Stub />)
}

describe('AccountMenu', () => {
  it('offers log in and register to Visitors', () => {
    renderMenu(null)
    expect(screen.getByRole('link', { name: copy.shell.logIn }).getAttribute('href')).toBe('/login')
    expect(screen.getByRole('link', { name: copy.shell.register }).getAttribute('href')).toBe(
      '/register',
    )
    expect(screen.queryByRole('button', { name: copy.shell.logOut })).toBeNull()
  })

  it('shows Members their name and a log out button posting to /logout', () => {
    const { container } = renderMenu(viewer)
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.queryByRole('link', { name: copy.shell.logIn })).toBeNull()
    const form = container.querySelector('form')
    expect(form?.getAttribute('action')).toBe('/logout')
    expect(form?.getAttribute('method')).toBe('post')
    expect(screen.getByRole('button', { name: copy.shell.logOut, hidden: true })).toBeTruthy()
  })
})
