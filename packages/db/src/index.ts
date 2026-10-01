export { type CreateDbOptions, createDb, type Database, type DbClient } from './client.js'
export { newId } from './ids.js'
export { MIGRATIONS_FOLDER, runMigrations } from './migrate.js'
export * from './schema/index.js'

export const PACKAGE_NAME = '@reprint/db'
export {
  assertSeedAllowed,
  createSeedRandom,
  resetDatabase,
  SEED,
  type SeedRandom,
} from './seed/index.js'
export { DEV_PASSWORD, DEV_PASSWORD_HASH, SEED_USER_COUNT } from './seed/modules/users.js'
