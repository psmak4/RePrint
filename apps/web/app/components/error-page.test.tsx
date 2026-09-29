// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ErrorPage } from './error-page.js'

function RouteError() {
  return <ErrorPage error={new Error('boom')} />
}

describe('ErrorPage', () => {
  it('renders a friendly page when a loader throws', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => null,
        loader: () => {
          throw new Error('boom')
        },
        ErrorBoundary: RouteError,
      },
    ])
    render(<Stub />)
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeTruthy()
    expect(screen.queryByText('boom')).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
  })

  it('renders the not-found copy for a 404 response', () => {
    render(
      <ErrorPage error={{ status: 404, statusText: 'Not Found', data: null, internal: true }} />,
    )
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
