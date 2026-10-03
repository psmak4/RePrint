/** Serializes JSON-LD so it can't close the script tag: `<` (and the line separators) become escapes. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Structured data for search engines (PRD §7.4, §11), as a script element with no raw-HTML escape hatch. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json">{serializeJsonLd(data)}</script>
}
