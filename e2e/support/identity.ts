import { randomBytes } from 'node:crypto'
import type { BrowserContext, Page } from '@playwright/test'

export const testPassword = 'correct horse battery staple'

/** A unique account per run, so retries and the three Playwright projects never collide. */
export function newIdentity(prefix: string) {
  const id = randomBytes(5).toString('hex')
  return { email: `${prefix}-${id}@example.test`, username: `${prefix}_${id}` }
}

/** Browser contexts that already have their own client IP. */
const withOwnIp = new WeakSet<BrowserContext>()

/**
 * Gives the browser its own client IP (the API trusts `x-forwarded-for` in the e2e stack), so the
 * per-IP limits in PRD §11 do not depend on how many specs ran before. That covers registration
 * and login, and also anonymous reads and Book resolves: without it every anonymous page load in
 * every spec counts against one IP, the web server's.
 */
export async function useOwnClientIp(page: Page) {
  const octet = () => 1 + ((randomBytes(1)[0] ?? 0) % 254)
  await page
    .context()
    .setExtraHTTPHeaders({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` })
  withOwnIp.add(page.context())
}

/** Like `useOwnClientIp`, but keeps the IP the browser already has, for helpers called mid-test. */
export async function ensureOwnClientIp(page: Page) {
  if (!withOwnIp.has(page.context())) await useOwnClientIp(page)
}
