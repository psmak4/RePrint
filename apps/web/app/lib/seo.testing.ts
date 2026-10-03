import type { SeoArgs } from './seo.js'

/** `meta` arguments for tests: a page path under a root route that loaded with the given origin. */
export function metaArgs(
  pathname = '/',
  extra: { loaderData?: unknown; params?: Record<string, string> } = {},
): SeoArgs & { loaderData: unknown; params: Record<string, string> } {
  return {
    location: { pathname },
    matches: [{ id: 'root', loaderData: { origin: 'https://reprint.test' } }],
    loaderData: extra.loaderData,
    params: extra.params ?? {},
  }
}
