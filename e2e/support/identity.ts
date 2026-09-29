import { randomBytes } from 'node:crypto'
import type { Page } from '@playwright/test'

export const testPassword = 'correct horse battery staple'

/** A unique account per run, so retries and the three Playwright projects never collide. */
export function newIdentity(prefix: string) {
  const id = randomBytes(5).toString('hex')
  return { email: `${prefix}-${id}@example.test`, username: `${prefix}_${id}` }
}

/**
 * Gives the browser its own client IP (the API trusts `x-forwarded-for` in the e2e stack), so the
 * per-IP registration and login limits in PRD §11 do not depend on how many specs ran before.
 */
export async function useOwnClientIp(page: Page) {
  const octet = () => 1 + ((randomBytes(1)[0] ?? 0) % 254)
  await page
    .context()
    .setExtraHTTPHeaders({ 'x-forwarded-for': `10.${octet()}.${octet()}.${octet()}` })
}
