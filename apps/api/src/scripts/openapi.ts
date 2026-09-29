import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../app.js'
import { loadEnv } from '../config/env.js'

const SPEC_PATH = fileURLToPath(new URL('../../openapi.json', import.meta.url))

/** Renders the OpenAPI document without touching Postgres or Redis. */
export async function renderOpenApiSpec(): Promise<string> {
  const env = loadEnv({
    NODE_ENV: 'test',
    WEB_ORIGINS: 'http://localhost:5173',
    DATABASE_URL: 'postgres://spec:spec@localhost:5432/spec',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
  })
  const app = await buildApp(env)
  try {
    await app.ready()
    return `${JSON.stringify(app.swagger(), null, 2)}\n`
  } finally {
    await app.close()
  }
}

async function main(): Promise<void> {
  const spec = await renderOpenApiSpec()
  if (process.argv.includes('--check')) {
    const committed = await readFile(SPEC_PATH, 'utf8').catch(() => '')
    if (committed !== spec) {
      console.error('apps/api/openapi.json is stale. Run `pnpm build` and commit the result.')
      process.exit(1)
    }
    console.log('apps/api/openapi.json is up to date.')
    return
  }
  await writeFile(SPEC_PATH, spec)
  console.log('Wrote apps/api/openapi.json')
}

// Run only as a script, not when a test imports `renderOpenApiSpec`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
