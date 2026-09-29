import { type Algorithm, hash, verify } from '@node-rs/argon2'

/** Argon2id at the OWASP baseline (PRD §8): 19 MiB, 2 iterations, parallelism 1. */
const ARGON2_OPTIONS = {
  // `Algorithm.Argon2id`; the package's const enum can't be imported under verbatimModuleSyntax.
  algorithm: 2 satisfies Algorithm,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

/** False for a wrong password and for a stored value that isn't a valid hash. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password)
  } catch {
    return false
  }
}
