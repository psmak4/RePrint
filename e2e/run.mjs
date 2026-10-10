// Runs the Playwright specs. In CI, or when E2E_STACK=external, it runs them against whatever
// environment is already set (CI starts its own isolated stack in the workflow). Otherwise it starts
// or reuses the isolated `reprint-e2e` Compose project (docker-compose.e2e.yml, own ports), migrates
// it, and points the apps and specs at it, so the `reprint` database used by `pnpm dev` is never written.
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function run(command, commandArgs, env = process.env) {
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

let env = process.env
if (!process.env.CI && process.env.E2E_STACK !== 'external') {
  const databaseUrl = 'postgres://reprint:reprint@localhost:25432/reprint'
  env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_DIRECT: databaseUrl,
    REDIS_URL: 'redis://localhost:26379',
    SMTP_PORT: '21025',
    MAILPIT_API_URL: 'http://localhost:28025',
    E2E_WEB_ORIGIN: 'http://www.reprint.localhost:25173',
    E2E_API_ORIGIN: 'http://api.reprint.localhost:23000',
  }
  console.log(
    'e2e: using the isolated reprint-e2e stack (Postgres :25432, Redis :26379, web :25173, api :23000)',
  )
  run(
    'docker',
    [
      'compose',
      '-p',
      'reprint-e2e',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.e2e.yml',
      'up',
      '-d',
      '--wait',
    ],
    env,
  )
  run('pnpm', ['db:migrate'], env)
}
run('pnpm', ['--filter', 'e2e', 'exec', 'playwright', 'test', ...args], env)
