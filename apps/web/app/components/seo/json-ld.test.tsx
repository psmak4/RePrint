import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JsonLd, serializeJsonLd } from './json-ld.js'

describe('JsonLd', () => {
  it('escapes < so text cannot close the script tag', () => {
    const json = serializeJsonLd({ name: '</script><img src=x onerror=alert(1)>' })
    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual({ name: '</script><img src=x onerror=alert(1)>' })
  })

  it('escapes the JavaScript line separators', () => {
    const json = serializeJsonLd({ name: 'a\u2028b\u2029c' })
    expect(json).not.toMatch(/[\u2028\u2029]/)
    expect(JSON.parse(json)).toEqual({ name: 'a\u2028b\u2029c' })
  })

  it('renders one ld+json script holding the data', () => {
    const html = renderToString(<JsonLd data={{ '@type': 'Book', name: 'Dune' }} />)
    expect(html).toBe('<script type="application/ld+json">{"@type":"Book","name":"Dune"}</script>')
  })

  it('keeps a hostile review body inside the script element', () => {
    const html = renderToString(
      <JsonLd data={{ reviewBody: '</script><script>alert(1)</script>' }} />,
    )
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
  })
})
