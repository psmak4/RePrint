// @vitest-environment jsdom
import type { Viewer } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createRoutesStub, Link } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountMenu } from '../shell/account-menu.js'
import { Menu } from './menu.js'

afterEach(cleanup)

function TwoMenus() {
  return (
    <>
      <p>Outside</p>
      <Link to="/next">Elsewhere</Link>
      <Menu label="First menu" button="First" buttonClassName="">
        <Link to="/next">Go</Link>
      </Menu>
      <Menu label="Second menu" button="Second" buttonClassName="">
        <span>Inside second</span>
      </Menu>
    </>
  )
}

function renderMenus() {
  const Stub = createRoutesStub([
    { path: '/', Component: TwoMenus },
    { path: '/next', Component: TwoMenus },
  ])
  render(<Stub initialEntries={['/']} />)
  const details = (name: string) =>
    screen.getByLabelText(name).closest('details') as HTMLDetailsElement
  const open = (name: string) => {
    const menu = details(name)
    menu.open = true
    fireEvent(menu, new Event('toggle'))
    return menu
  }
  return { details, open }
}

describe('Menu (D-214)', () => {
  it('is a native details element, so it opens without JavaScript', () => {
    const { details } = renderMenus()
    expect(details('First menu').tagName).toBe('DETAILS')
    expect(details('First menu').querySelector('summary')?.getAttribute('aria-label')).toBe(
      'First menu',
    )
  })

  it('closes on Escape and returns focus to its button', () => {
    const { open } = renderMenus()
    const menu = open('First menu')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu.open).toBe(false)
    expect(document.activeElement).toBe(screen.getByLabelText('First menu'))
  })

  it('closes on a click or tap outside, and stays open for one inside', () => {
    const { open } = renderMenus()
    const menu = open('First menu')
    fireEvent.pointerDown(menu.querySelector('div') as HTMLElement)
    expect(menu.open).toBe(true)
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(menu.open).toBe(false)
  })

  it('closes when another menu opens', () => {
    const { open } = renderMenus()
    const first = open('First menu')
    const second = open('Second menu')
    expect(first.open).toBe(false)
    expect(second.open).toBe(true)
  })

  it('closes when the page changes', async () => {
    const { open, details } = renderMenus()
    open('First menu')
    fireEvent.click(screen.getByRole('link', { name: 'Go' }))
    await waitFor(() => expect(details('First menu').open).toBe(false))
  })
})

const member: Viewer = {
  id: '01900000-0000-7000-8000-000000000001',
  username: 'ada',
  displayName: 'Ada',
  verified: true,
  permissions: ['reviews.write'],
}

function renderAccount(viewer: Viewer) {
  const Stub = createRoutesStub([{ path: '/', Component: () => <AccountMenu viewer={viewer} /> }])
  render(<Stub initialEntries={['/']} />)
  const panel = screen.getByLabelText('Account menu').closest('details') as HTMLElement
  return within(panel)
}

describe('AccountMenu (D-214)', () => {
  it("links to the Member's profile, Library, and Settings, then Log out", () => {
    const menu = renderAccount(member)
    expect(menu.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/u/ada',
      '/u/ada/library',
      '/settings',
    ])
    expect(
      menu.getByRole('button', { name: 'Log out' }).closest('form')?.getAttribute('action'),
    ).toBe('/logout')
    expect(menu.queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it('adds Admin for a viewer who may open the admin area', () => {
    const menu = renderAccount({ ...member, permissions: ['reviews.write', 'reviews.moderate'] })
    expect(menu.getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
  })
})
