#!/usr/bin/env node
// How much database and Redis work one page view costs (M10-T13; docs/performance.md).
//
// Statements are counted from Postgres's statement log, so turn it on for the database under test
// first (`alter database <db> set log_statement = 'all'`, then restart the API so its connections
// pick it up), and give the stack a database of its own. Redis commands are Redis's processed-
// command count, so give the stack a Redis of its own too. Each figure is the smallest of several
// runs, since other traffic only ever adds.
//
// Usage: node apps/web/scripts/perf/measure-page-view.mjs <path> [--runs 5] [--cookie "rp_session=…"]
// Env:   WEB_URL (default http://localhost:5173), POSTGRES_CONTAINER (default reprint-postgres-1),
//        REDIS_CONTAINER (default reprint-redis-1), PROXY_URL (a count-api-requests.mjs proxy the
//        web server sends its API requests through; optional)
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const path = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'))
if (!path) {
  console.error('usage: measure-page-view.mjs <path> [--runs 5] [--cookie "rp_session=…"]')
  process.exit(2)
}
const runs = Number(option('runs') ?? 5)
const cookie = option('cookie')
const web = process.env.WEB_URL ?? 'http://localhost:5173'
const postgres = process.env.POSTGRES_CONTAINER ?? 'reprint-postgres-1'
const redis = process.env.REDIS_CONTAINER ?? 'reprint-redis-1'
const proxy = process.env.PROXY_URL

const docker = (...command) =>
  execFileSync('docker', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
// Postgres writes its log to stderr, so read both streams.
const countStatements = (since) => {
  const out = execFileSync('sh', ['-c', `docker logs --since ${since} ${postgres} 2>&1`], {
    encoding: 'utf8',
  })
  return out.split('\n').filter((line) => /LOG: {2}(statement|execute)/.test(line)).length
}
const commands = () =>
  Number(
    /total_commands_processed:(\d+)/.exec(docker('exec', redis, 'redis-cli', 'info', 'stats'))?.[1],
  )
const apiRequests = async () => {
  if (!proxy) return null
  const counts = await (await fetch(new URL('/__counts', proxy))).json()
  return Object.values(counts).reduce((sum, n) => sum + n, 0)
}

const headers = {
  'x-forwarded-for': `10.250.${process.pid % 250}.1`,
  ...(cookie ? { cookie } : {}),
}
await (await fetch(new URL(path, web), { headers })).text() // warm up: caches and lazily built things
await sleep(1000)
await apiRequests()
const results = []
for (let run = 0; run < runs; run += 1) {
  const since = (Date.now() / 1000).toFixed(3)
  const c0 = commands()
  const started = performance.now()
  const response = await fetch(new URL(path, web), { headers })
  await response.text()
  const ms = performance.now() - started
  await sleep(800)
  const c1 = commands()
  results.push({
    status: response.status,
    api: await apiRequests(),
    statements: countStatements(since),
    redis: c1 - c0 - 1,
    ms: Math.round(ms),
  })
  await sleep(1200) // so the next run's log window starts after this one's last line
}
const best = (key) => Math.min(...results.map((result) => result[key]))
console.log(
  JSON.stringify({
    path,
    signedIn: Boolean(cookie),
    status: results[0]?.status,
    apiRequests: proxy ? best('api') : undefined,
    statements: best('statements'),
    redis: best('redis'),
    fastestMs: best('ms'),
  }),
)
