import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { createDb } from '@reprint/db'
import { createFirstAdmin, SeedAdminError } from '../modules/accounts/seed-admin.js'

/** Reads the password from a pipe, or asks for it on a terminal. It is never taken from argv. */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    let text = ''
    for await (const chunk of process.stdin) text += String(chunk)
    return text.replace(/\r?\n$/, '')
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question('Password (at least 12 characters): ')
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  // `pnpm --filter api seed:admin -- --email …` forwards the bare `--`.
  const argv = process.argv.slice(2).filter((arg, i) => !(arg === '--' && i === 0))
  const { values } = parseArgs({
    args: argv,
    options: { email: { type: 'string' }, username: { type: 'string' } },
  })
  const databaseUrl = process.env.DATABASE_URL
  if (!values.email || !values.username || !databaseUrl) {
    console.error(
      'Usage: DATABASE_URL=… pnpm --filter api seed:admin -- --email <email> --username <name>\n' +
        'The password is read from stdin (or prompted for on a terminal).',
    )
    process.exitCode = 2
    return
  }
  const password = await readPassword()
  const { db, close } = createDb(databaseUrl, { max: 1 })
  try {
    const admin = await createFirstAdmin(db, {
      email: values.email,
      username: values.username,
      password,
    })
    console.log(`Created Admin "${admin.username}" (${admin.id}).`)
  } catch (error) {
    if (!(error instanceof SeedAdminError)) throw error
    console.error(error.message)
    process.exitCode = 1
  } finally {
    await close()
  }
}

await main()
