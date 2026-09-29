import { createHash, randomBytes } from 'node:crypto'

/** A random 256-bit token, base64url encoded (43 characters). Only its hash is ever stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 hex digest. Tokens are high-entropy, so a fast unsalted hash is enough. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
