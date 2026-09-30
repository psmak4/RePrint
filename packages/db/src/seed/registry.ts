import type { Database } from '../client.js'
import { usersSeed } from './modules/users.js'
import type { SeedRandom } from './prng.js'

export interface SeedContext {
  /** Runs inside one transaction for the whole seed. */
  db: Database
  random: SeedRandom
}

export interface SeedModule {
  /** Unique name, used in logs. */
  name: string
  run: (context: SeedContext) => Promise<void>
}

/**
 * Every seed module, in the order it runs. A module may rely on rows written by the ones above it.
 * Later milestones append here (see README.md).
 */
export const seedModules: readonly SeedModule[] = [usersSeed]
