import { isValidElement, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { linkHref, type RichNode, type RichTree } from './rich-tree.js'

/** What Source Markdown may render as (D-202); everything else is reduced to its text. */
const BLOCK_ELEMENTS = ['p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'a']
/** Inside a paragraph only phrasing content may appear, so lists become plain lines there. */
const INLINE_ELEMENTS = ['p', 'br', 'em', 'strong', 'a']
const CONTAINERS = new Set(['p', 'em', 'strong', 'ul', 'ol', 'li'])

function toNodes(node: ReactNode): RichNode[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(toNodes)
  if (!isValidElement(node)) return []
  const props = node.props as { children?: ReactNode; href?: string }
  const children = toNodes(props.children)
  if (node.type === 'br') return [{ tag: 'br' }]
  if (node.type === 'a') {
    const href = linkHref(props.href)
    return href ? [{ tag: 'a', href, children }] : children
  }
  if (typeof node.type === 'string' && CONTAINERS.has(node.type)) {
    return [{ tag: node.type as 'p', children }]
  }
  // A Fragment, or anything outside the allowed set: its text only.
  return children
}

/**
 * Parses Markdown from a Source, or typed by an admin, into the tree `RichText` draws (D-202,
 * M10-T08): paragraphs, line breaks, emphasis, lists, and outside links. It runs `react-markdown`
 * itself, so the result is what the page rendered before, but only on the server. Raw HTML is
 * skipped. `inline` keeps phrasing content only, for use inside a paragraph.
 */
export function toRichTree(text: string, { inline = false }: { inline?: boolean } = {}): RichTree {
  return toNodes(
    Markdown({
      children: text,
      allowedElements: inline ? INLINE_ELEMENTS : BLOCK_ELEMENTS,
      unwrapDisallowed: true,
      skipHtml: true,
    }),
  )
}
