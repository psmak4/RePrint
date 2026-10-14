// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { toRichTree } from '../lib/rich-text.server.js'
import { RichText } from './rich-text.js'

afterEach(cleanup)

/** The page parses on the server and draws the tree (M10-T08); these tests do both. */
const md = (text: string, inline = false) => toRichTree(text, { inline })

const colfer =
  'Eoin Colfer (pronounced "Owen") is an Irish author.\n\n([source][1])\n\n[1]: https://en.wikipedia.org/wiki/Eoin_Colfer'

describe('RichText', () => {
  it('renders a reference link as a link and drops its definition', () => {
    const { container } = render(<RichText tree={md(colfer)} />)
    const link = screen.getByRole('link', { name: 'source' })
    expect(link.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Eoin_Colfer')
    expect(container.textContent).not.toContain('[1]')
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('marks outside links nofollow and keeps them in the same tab', () => {
    render(<RichText tree={md('See [his site](https://example.org/eoin).')} />)
    const link = screen.getByRole('link', { name: 'his site' })
    expect(link.getAttribute('rel')).toBe('nofollow ugc noopener noreferrer')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('renders emphasis and lists', () => {
    const { container } = render(<RichText tree={md('A *very* **good** book.\n\n- one\n- two')} />)
    expect(container.querySelector('em')?.textContent).toBe('very')
    expect(container.querySelector('strong')?.textContent).toBe('good')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['one', 'two'])
  })

  it('shows unsafe, relative, and Source links as their text only', () => {
    const { container } = render(
      <RichText
        tree={md(
          '[a](javascript:alert(1)) [b](/books/x) [c](https://openlibrary.org/authors/x) [d](mailto:a@b.c)',
        )}
      />,
    )
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(container.textContent).toBe('a b c d')
  })

  it('skips raw HTML and reduces headings, images, and code to text', () => {
    const { container } = render(
      <RichText
        tree={md(
          '# Big heading\n\n<script>alert(1)</script>\n\nSome <b>bold</b> ![cover](https://example.org/c.jpg) `code`',
        )}
      />,
    )
    expect(container.querySelector('script, b, h1, img, code')).toBeNull()
    expect(container.textContent).toContain('Big heading')
    expect(container.textContent).not.toContain('alert')
    expect(container.textContent).toContain('code')
  })

  it('keeps single line breaks inside a paragraph', () => {
    const { container } = render(<RichText tree={md('Line one\nLine two')} />)
    expect(container.querySelector('p')?.className).toContain('whitespace-pre-line')
  })

  it('stays phrasing content in inline mode, for use inside a paragraph', () => {
    const { container } = render(
      <p>
        <RichText inline tree={md('One *two*.\n\nThree.\n\n- four', true)} />
      </p>,
    )
    expect(container.querySelector('p p, p ul, p li, p div')).toBeNull()
    expect(container.textContent).toContain('four')
  })

  it('has no axe violations', async () => {
    const { container } = render(<RichText tree={md(colfer)} />)
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
