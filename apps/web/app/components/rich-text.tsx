import { cn } from '@reprint/ui'
import Markdown, { type Components } from 'react-markdown'

/** What Source Markdown may render as (D-202); everything else is reduced to its text. */
const BLOCK_ELEMENTS = ['p', 'br', 'em', 'strong', 'ul', 'ol', 'li', 'a']
/** Inside a paragraph only phrasing content may appear, so lists become plain lines there. */
const INLINE_ELEMENTS = ['p', 'br', 'em', 'strong', 'a']

/**
 * Hosts never linked: a Source's own pages would put its IDs in front of readers (PRD §5). The
 * Catalog already unlinks them on import (D-202); this also covers text stored before that.
 */
const UNLINKED_HOSTS = /(^|\.)openlibrary\.org$/i

/** The address a link may point to, or `null` to show only its text: absolute web addresses only. */
export function linkHref(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return UNLINKED_HOSTS.test(parsed.hostname) ? null : parsed.href
  } catch {
    return null
  }
}

const link: Components['a'] = ({ href, children }) => {
  const target = linkHref(href)
  if (!target) return <>{children}</>
  return (
    <a
      href={target}
      rel="nofollow ugc noopener noreferrer"
      className="text-link underline underline-offset-[3px] hover:no-underline"
    >
      {children}
    </a>
  )
}

const blockComponents: Components = {
  a: link,
  // Single line breaks inside a paragraph stay breaks, as they did when this was plain text.
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6">{children}</ol>,
}

const inlineComponents: Components = {
  a: link,
  p: ({ children }) => <span className="block whitespace-pre-line">{children}</span>,
}

/**
 * Markdown from a Source, or typed by an admin, rendered safely (D-202): paragraphs, line breaks,
 * emphasis, lists, and outside links. Raw HTML is skipped and no `innerHTML` is used. `inline`
 * renders spans only, for use inside a paragraph.
 */
export function RichText({
  text,
  inline = false,
  id,
  className,
}: {
  text: string
  inline?: boolean
  id?: string
  className?: string
}) {
  const markdown = (
    <Markdown
      allowedElements={inline ? INLINE_ELEMENTS : BLOCK_ELEMENTS}
      unwrapDisallowed
      skipHtml
      components={inline ? inlineComponents : blockComponents}
    >
      {text}
    </Markdown>
  )
  return inline ? (
    <span id={id} className={cn('flex flex-col gap-2', className)}>
      {markdown}
    </span>
  ) : (
    <div id={id} className={cn('[&>*+*]:mt-4', className)}>
      {markdown}
    </div>
  )
}
