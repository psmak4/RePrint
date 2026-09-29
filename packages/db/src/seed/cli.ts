import { resetDatabase, runSeed } from './run.js'

// The local compose database, matching .env.example, so a fresh clone works without a .env file.
const LOCAL_URL = 'postgres://reprint:reprint@localhost:5432/reprint'

const command = process.argv[2]
if (command !== 'seed' && command !== 'reset') {
  console.error('usage: seed-cli <seed|reset>')
  process.exit(1)
}

const url =
  process.env.DATABASE_URL || (process.env.NODE_ENV === 'production' ? undefined : LOCAL_URL)
if (!url) {
  console.error(`db:${command}: set DATABASE_URL (see .env.example)`)
  process.exit(1)
}

const options = { nodeEnv: process.env.NODE_ENV, log: console.log }
try {
  await (command === 'reset' ? resetDatabase(url, options) : runSeed(url, options))
  console.log(`db:${command}: done`)
} catch (error) {
  console.error(`db:${command}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
