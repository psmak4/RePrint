import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderOpenApiSpec } from './scripts/openapi.js'

const STAFF_DIRS = ['modules/moderation', 'modules/admin']
// A route path is a quoted string or a template; `${...}` parts match any one path segment.
const ROUTE_START =
  /app\.(get|post|put|patch|delete)\(\s*['`](\/(?:mod|admin)\/(?:\$\{[^}]*\}|[^'`])*)['`]/g

type Registration = { route: string; source: string; file: string }

async function staffRegistrations(): Promise<Registration[]> {
  const registrations: Registration[] = []
  for (const dir of STAFF_DIRS) {
    const directory = fileURLToPath(new URL(`./${dir}/`, import.meta.url))
    for (const name of await readdir(directory)) {
      if (!name.endsWith('.ts') || name.includes('.test.')) continue
      const text = await readFile(`${directory}${name}`, 'utf8')
      const starts = [...text.matchAll(ROUTE_START)]
      starts.forEach((match, index) => {
        const [, method, path] = match
        if (!method || !path) return
        const end = starts[index + 1]?.index ?? text.length
        registrations.push({
          route: `${method.toUpperCase()} /v1${path.replace(/:(\w+)/g, '{$1}').replace(/\$\{[^}]*\}/g, '*')}`,
          source: text.slice(match.index, end),
          file: `${dir}/${name}`,
        })
      })
    }
  }
  return registrations
}

describe('every /mod/* and /admin/* route is guarded by a permission preHandler', () => {
  it('registers a preHandler built from requirePermission on each route', async () => {
    const registrations = await staffRegistrations()
    const unguarded: string[] = []
    for (const { route, source, file } of registrations) {
      const guardNames = [...source.matchAll(/preHandler:\s*\[\s*(\w+)/g)].map((m) => m[1])
      const fileText = await readFile(fileURLToPath(new URL(`./${file}`, import.meta.url)), 'utf8')
      const guarded = guardNames.some(
        (name) =>
          name !== undefined &&
          new RegExp(`const ${name}\\s*=\\s*requirePermission\\(`).test(fileText),
      )
      if (!guarded) unguarded.push(`${route} (${file})`)
    }
    expect(unguarded).toEqual([])
  })

  it('finds exactly the /mod and /admin routes the API serves', async () => {
    const spec = JSON.parse(await renderOpenApiSpec()) as {
      paths: Record<string, Record<string, unknown>>
    }
    const served = Object.entries(spec.paths)
      .filter(([path]) => /^\/v1\/(mod|admin)\//.test(path))
      .flatMap(([path, operations]) =>
        Object.keys(operations)
          .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map((method) => `${method.toUpperCase()} ${path}`),
      )
    const patterns = (await staffRegistrations()).map(({ route }) => ({
      route,
      matcher: new RegExp(`^${route.replace(/[.+?^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+')}$`),
    }))
    const unregistered = served.filter(
      (route) => !patterns.some(({ matcher }) => matcher.test(route)),
    )
    const unserved = patterns.filter(({ matcher }) => !served.some((route) => matcher.test(route)))
    expect(unregistered).toEqual([])
    expect(unserved).toEqual([])
  })
})
