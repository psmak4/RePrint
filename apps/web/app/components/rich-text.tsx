import { cn } from '@reprint/ui'
import { Fragment, type ReactNode } from 'react'
import { linkHref, type RichTree } from '../lib/rich-tree.js'

function draw(nodes: RichTree, inline: boolean): ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node
    // Nodes never move, so their place is a stable key.
    const key = index
    if (node.tag === 'br') return <br key={key} />
    const children = draw(node.children, inline)
    switch (node.tag) {
      case 'a': {
        // Checked again here, so a tree from anywhere still links only outside web addresses.
        const href = linkHref(node.href)
        if (!href) return <Fragment key={key}>{children}</Fragment>
        return (
          <a
            key={key}
            href={href}
            rel="nofollow ugc noopener noreferrer"
            className="text-link underline underline-offset-[3px] hover:no-underline"
          >
            {children}
          </a>
        )
      }
      // Single line breaks inside a paragraph stay breaks, as they did when this was plain text.
      case 'p':
        return inline ? (
          <span key={key} className="block whitespace-pre-line">
            {children}
          </span>
        ) : (
          <p key={key} className="whitespace-pre-line">
            {children}
          </p>
        )
      case 'ul':
        return (
          <ul key={key} className="list-disc pl-6">
            {children}
          </ul>
        )
      case 'ol':
        return (
          <ol key={key} className="list-decimal pl-6">
            {children}
          </ol>
        )
      case 'li':
        return <li key={key}>{children}</li>
      case 'em':
        return <em key={key}>{children}</em>
      default:
        return <strong key={key}>{children}</strong>
    }
  })
}

/**
 * Markdown from a Source, or typed by an admin, drawn safely (D-202) from the tree the server
 * parsed (`toRichTree`, M10-T08): paragraphs, line breaks, emphasis, lists, and outside links. No
 * `innerHTML` is used. `inline` renders spans only, for use inside a paragraph.
 */
export function RichText({
  tree,
  inline = false,
  id,
  className,
}: {
  tree: RichTree
  inline?: boolean
  id?: string
  className?: string
}) {
  const content = draw(tree, inline)
  return inline ? (
    <span id={id} className={cn('flex flex-col gap-2', className)}>
      {content}
    </span>
  ) : (
    <div id={id} className={cn('[&>*+*]:mt-4', className)}>
      {content}
    </div>
  )
}
