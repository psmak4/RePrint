// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResolvePage } from './resolve-page.js'

afterEach(cleanup)

const ref = 'a'.repeat(22)

describe('ResolvePage', () => {
  it('shows the failure message with a retry button that reloads the resolve route', async () => {
    const loader = vi.fn(() => null)
    const Stub = createRoutesStub([
      {
        path: '/resolve',
        loader,
        Component: () => <ResolvePage state="failed" candidateRef={ref} />,
      },
    ])
    render(<Stub initialEntries={[`/resolve?ref=${ref}`]} />)
    expect(
      await screen.findByRole('heading', { name: 'We couldn’t load this book right now' }),
    ).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.closest('form')?.getAttribute('method')).toBe('get')
    expect(retry.closest('form')?.getAttribute('action')).toBe('/resolve')
    expect(document.querySelector<HTMLInputElement>('input[name="ref"]')?.value).toBe(ref)
    retry.click()
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
  })

  it('offers a way back to search when the reference has expired', async () => {
    const Stub = createRoutesStub([
      { path: '/resolve', Component: () => <ResolvePage state="notFound" candidateRef={null} /> },
    ])
    render(<Stub initialEntries={['/resolve']} />)
    expect(await screen.findByRole('heading', { name: 'We couldn’t find that book' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to search' }).getAttribute('href')).toBe(
      '/search',
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
