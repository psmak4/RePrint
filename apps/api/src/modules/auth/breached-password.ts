import { createHash } from 'node:crypto'
import type { FastifyBaseLogger } from 'fastify'

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const TIMEOUT_MS = 2_000

export interface BreachedPasswordOptions {
  mode: 'live' | 'off'
  log: Pick<FastifyBaseLogger, 'warn'>
  /** Replaceable in tests. */
  fetchImpl?: typeof fetch
}

/**
 * Checks a password against Have I Been Pwned with the range API (k-anonymity): only the first
 * five characters of the SHA-1 hash leave the server. Fails open when the API can't be reached (D-029).
 */
export async function isBreachedPassword(
  password: string,
  { mode, log, fetchImpl = fetch }: BreachedPasswordOptions,
): Promise<boolean> {
  if (mode === 'off') return false
  const digest = createHash('sha1').update(password).digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)
  try {
    const response = await fetchImpl(`${RANGE_URL}${prefix}`, {
      headers: { 'add-padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`range API answered ${response.status}`)
    const body = await response.text()
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':')
      // Padding entries have a count of 0 and are not real matches.
      return candidate === suffix && Number(count) > 0
    })
  } catch (error) {
    log.warn({ err: error }, 'breached-password check unavailable; allowing password')
    return false
  }
}
