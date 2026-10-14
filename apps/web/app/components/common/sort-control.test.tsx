// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { createRoutesStub, Link, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { SortControl } from './sort-control.js'

afterEach(cleanup)

const SORTS = ['newest', 'oldest', 'title'] as const
const labels = { newest: 'Newest', oldest: 'Oldest', title: 'Title' }

function Page() {
  const params = new URLSearchParams(useLocation().search)
  const sort = (params.get('sort') ?? 'newest') as (typeof SORTS)[number]
  return (
    <>
      <p data-testid="url">{useLocation().search}</p>
      <SortControl
        action="/list"
        value={sort}
        options={SORTS}
        optionLabel={(option) => labels[option]}
        keep={{ shelf: params.get('shelf') ?? undefined, empty: undefined }}
      />
    </>
  )
}

const stub = () => createRoutesStub([{ path: '/list', Component: Page }])

describe('SortControl (D-214)', () => {
  it('applies a choice at once, keeps the other values, and leaves focus on the dropdown', async () => {
    const Stub = stub()
    render(<Stub initialEntries={['/list?shelf=read']} />)
    const select = screen.getByLabelText('Sort by') as HTMLSelectElement
    expect(select.value).toBe('newest')
    select.focus()
    fireEvent.change(select, { target: { value: 'title' } })
    await waitFor(() =>
      expect(screen.getByTestId('url').textContent).toBe('?shelf=read&sort=title'),
    )
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('title')
    expect(document.activeElement).toBe(screen.getByLabelText('Sort by'))
    // No Apply button while JavaScript runs.
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull()
  })

  it('shows the URL’s sort after a link changes it (Back, a new search)', async () => {
    function Linked() {
      return (
        <>
          <Link to="/list?sort=oldest">Oldest first</Link>
          <Page />
        </>
      )
    }
    const Stub = createRoutesStub([{ path: '/list', Component: Linked }])
    render(<Stub initialEntries={['/list?sort=title']} />)
    expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('title')
    fireEvent.click(screen.getByRole('link', { name: 'Oldest first' }))
    await waitFor(() =>
      expect((screen.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('oldest'),
    )
  })

  it('works without JavaScript: a GET form to the page with an Apply button in noscript', () => {
    const Stub = stub()
    const html = renderToString(<Stub initialEntries={['/list?shelf=read&sort=oldest']} />)
    const form = html.match(/<form[^>]*>/)?.[0] ?? ''
    expect(form).toContain('method="get"')
    expect(form).toContain('action="/list"')
    expect(html).toMatch(
      /<noscript>.*<button[^>]*type="submit"[^>]*>Apply<\/button>.*<\/noscript>/s,
    )
    expect(html).toContain('name="shelf" value="read"')
    expect(html).not.toContain('name="empty"')
  })
})
