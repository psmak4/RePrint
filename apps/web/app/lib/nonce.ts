/**
 * The page's CSP nonce, read back on the client (undefined on the server).
 *
 * The server renders the nonce into every script and link (`entry.server.tsx`), and the browser then
 * empties the `nonce` attribute, keeping the value only in the element's `nonce` property. The client
 * router is never told the nonce, so `Links` would render `nonce={undefined}` where the server sent
 * one, and React reports a hydration mismatch. Passing this to `Links` keeps both sides the same;
 * on the server `Links` takes the nonce from the router context instead.
 */
export function clientNonce(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const script = document.querySelector<HTMLScriptElement>('script[nonce]')
  return script?.nonce || script?.getAttribute('nonce') || undefined
}
