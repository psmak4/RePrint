/**
 * Tells the Catalog a reader clicked a stored Book in search results or suggestions, so a Book a
 * Series sync brought in counts as reached and its own Series may fill in (D-200). Sent on the
 * click rather than through the link, since crawlers follow links but don't click. A beacon
 * survives the navigation that follows.
 */
export function sendReached(slug: string): void {
  const url = `/books/${encodeURIComponent(slug)}/reached`
  try {
    if (navigator.sendBeacon?.(url)) return
    void fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined)
  } catch {
    // Best effort: a lost signal only leaves the Book's other Series for the next reader.
  }
}
