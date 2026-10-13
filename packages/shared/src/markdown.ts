/** Characters Markdown lets a writer escape with a backslash. */
const ESCAPABLE = /\\([\\`*_{}[\]()#+\-.!>|~])/g
/** Escaped characters wait in the Unicode private use area while the syntax is removed. */
const HOLD = 0xe000

/**
 * The plain text of a Markdown string (D-202), for places markup cannot go: a meta description,
 * JSON-LD, and similar. Links and images keep their text, definitions, markers, and HTML tags go, and
 * paragraphs stay separated by a blank line.
 */
export function markdownToText(markdown: string): string {
  return (
    markdown
      .replace(/\r\n?/g, '\n')
      .replace(ESCAPABLE, (_, char: string) => String.fromCharCode(HOLD + char.charCodeAt(0)))
      // Reference definitions: `[label]: url "title"`.
      .replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S+.*$/gm, '')
      .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
      .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, '$1')
      .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, '$1')
      .replace(/<\/?[a-zA-Z][^<>\n]*>/g, '')
      // Thematic breaks before list markers, which a `---` or `* * *` line would also match.
      .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
      .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm, '$1')
      .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
      .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
      .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
      .replace(/[-]/g, (char) => String.fromCharCode(char.charCodeAt(0) - HOLD))
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
