// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, useRouteError } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ErrorPage } from './error-page.js'

afterEach(() => {
  cleanup()
  document.title = ''
})

function Boundary() {
  return <ErrorPage error={useRouteError()} />
}

function renderFailing(status: number) {
  const Stub = createRoutesStub([
    {
      path: '/',
      Component: () => null,
      ErrorBoundary: Boundary,
      loader: () => {
        throw new Response('', { status })
      },
    },
  ])
  render(<Stub initialEntries={['/']} />)
}

describe('ErrorPage', () => {
  it('names the tab on a 404, as every page does (D-214)', async () => {
    renderFailing(404)
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(document.title).toMatch(/ \| RePrint$/))
    expect(document.title).toBe(
      `${screen.getByRole('heading', { level: 1 }).textContent} | RePrint`,
    )
  })

  it('names the tab on a server error too', async () => {
    renderFailing(500)
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(document.title).toMatch(/ \| RePrint$/))
  })
})
