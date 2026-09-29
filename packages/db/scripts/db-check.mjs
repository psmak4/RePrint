// Migration drift check (PRD §12): the Drizzle schema must match the committed migrations.
//  1. `drizzle-kit check` verifies the migration history itself is consistent.
//  2. `drizzle-kit generate` into a scratch copy of the migrations folder must produce nothing new.
// Needs no database connection.
import { spawnSync } from 'node:child_process'
import { cpSync, readdirSync, rmSync } from 'node:fs'

const run = (args, env = {}) =>
  spawnSync('pnpm', ['exec', 'drizzle-kit', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })

const check = run(['check'])
if (check.status !== 0) {
  process.stderr.write(check.stdout + check.stderr)
  console.error(
    'db:check FAILED: the migration history is inconsistent (see drizzle-kit output above).',
  )
  process.exit(1)
}

// Relative on purpose: drizzle-kit prefixes `./` to the out path.
const scratch = '.drizzle-check'
rmSync(scratch, { recursive: true, force: true })
try {
  cpSync('drizzle', scratch, { recursive: true })
  const before = new Set(readdirSync(scratch).filter((f) => f.endsWith('.sql')))
  const generate = run(['generate', '--name', 'drift'], { DRIZZLE_OUT: scratch })
  if (generate.status !== 0) {
    process.stderr.write(generate.stdout + generate.stderr)
    console.error('db:check FAILED: drizzle-kit generate errored.')
    process.exit(1)
  }
  const added = readdirSync(scratch).filter((f) => f.endsWith('.sql') && !before.has(f))
  if (added.length > 0) {
    console.error(
      'db:check FAILED: the schema has changes with no migration. Run `pnpm db:generate` and commit the result.',
    )
    process.exit(1)
  }
  console.log('db:check OK: schema matches migrations')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
