export { type CreateDbOptions, createDb, type Database, type DbClient } from './client.js'
export { newId } from './ids.js'
export { MIGRATIONS_FOLDER, runMigrations } from './migrate.js'
export * from './schema/index.js'

export const PACKAGE_NAME = '@reprint/db'
