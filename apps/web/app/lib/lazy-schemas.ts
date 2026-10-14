/**
 * Starts loading the response schemas (and Zod with them) beside a request, rather than with the
 * page (M10-T14). Await the result once the response is in.
 */
export function lazySchemas() {
  const loading = import('./response-schemas.js')
  // A failed load still throws where it is awaited; this only keeps an early return from leaving
  // the import unhandled.
  loading.catch(() => {})
  return loading
}
