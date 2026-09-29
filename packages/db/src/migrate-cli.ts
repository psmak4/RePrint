import { runMigrations } from './migrate.js'

// The local compose database, matching .env.example, so a fresh clone works without a .env file.
const LOCAL_URL = 'postgres://reprint:reprint@localhost:5432/reprint'

// Migrations may need a direct (non-pooled) connection on Neon (see .env.example).
const url =
  process.env.DATABASE_URL_DIRECT ||
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === 'production' ? undefined : LOCAL_URL)
if (!url) {
  console.error('db:migrate: set DATABASE_URL (see .env.example)')
  process.exit(1)
}

await runMigrations(url)
console.log('db:migrate: migrations applied')
