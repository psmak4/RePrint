import { buildApp } from './app.js'
import { EnvError, loadEnv } from './config/env.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const app = await buildApp(env)
  await app.listen({ host: env.HOST, port: env.PORT })
}

main().catch((error: unknown) => {
  // Env problems get a plain message (no stack) so a missing variable is obvious.
  console.error(error instanceof EnvError ? error.message : error)
  process.exit(1)
})
