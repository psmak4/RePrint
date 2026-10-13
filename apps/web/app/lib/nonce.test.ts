// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { clientNonce } from './nonce.js'

afterEach(() => {
  document.head.replaceChildren()
})

function addScript(nonce: string, { hideAttribute }: { hideAttribute: boolean }) {
  const script = document.createElement('script')
  script.setAttribute('nonce', nonce)
  // A browser keeps the value only in the `nonce` property and empties the attribute.
  // jsdom reflects the property to the attribute, so pin the property as a browser would.
  if (hideAttribute) {
    script.setAttribute('nonce', '')
    Object.defineProperty(script, 'nonce', { value: nonce })
  }
  document.head.append(script)
}

describe('clientNonce', () => {
  it('reads the nonce from a server-rendered script even when the attribute is hidden', () => {
    addScript('abc123', { hideAttribute: true })
    expect(clientNonce()).toBe('abc123')
  })

  it('falls back to the attribute where the property is not set', () => {
    addScript('abc123', { hideAttribute: false })
    expect(clientNonce()).toBe('abc123')
  })

  it('is undefined when no script carries a nonce', () => {
    expect(clientNonce()).toBeUndefined()
  })
})
