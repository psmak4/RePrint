// Checks the built client bundle (M10-T07): the JavaScript every page loads (the client entry and
// the root route) must not contain Zod or the copy of the admin, legal, or settings pages, which
// only their own routes need. Prints the gzip size each main page loads. Run after `pnpm build`.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(web, 'build/client/assets')

const manifestFile = readdirSync(assets).find((file) => /^manifest-.*\.js$/.test(file))
if (!manifestFile) {
  console.error('check-bundle: no client manifest; run `pnpm build` first')
  process.exit(1)
}
const manifest = JSON.parse(
  readFileSync(join(assets, manifestFile), 'utf8')
    .replace(/^window\.__reactRouterManifest=/, '')
    .replace(/;\s*$/, ''),
)

/** The asset files a route loads before it runs, with the client entry and the root route. */
function filesFor(routeId) {
  const files = [manifest.entry.module, ...manifest.entry.imports]
  for (const id of ['root', routeId]) {
    const route = manifest.routes[id]
    if (!route) throw new Error(`check-bundle: no route ${id} in the manifest`)
    files.push(route.module, ...(route.imports ?? []))
  }
  return [...new Set(files.map((file) => file.split('/').pop()))]
}
const read = (file) => readFileSync(join(assets, file), 'utf8')

/** Long, distinctive string literals of a copy module: if one is in a chunk, the module is too. */
function copyStrings(module) {
  const source = readFileSync(join(web, 'app/copy', module), 'utf8')
  return [...source.matchAll(/'([^'\\\n]{30,})'/g)].map((match) => match[1])
}

const forbidden = [
  { what: 'Zod', markers: ['ZodError', 'invalid_type'] },
  { what: 'admin copy', markers: copyStrings('admin.ts') },
  { what: 'legal copy', markers: copyStrings('legal.ts') },
  { what: 'settings copy', markers: copyStrings('settings.ts') },
]

const everyPage = [
  ...new Set(
    [
      manifest.entry.module,
      ...manifest.entry.imports,
      manifest.routes.root.module,
      ...(manifest.routes.root.imports ?? []),
    ].map((file) => file.split('/').pop()),
  ),
]
const problems = []
for (const file of everyPage) {
  const code = read(file)
  for (const { what, markers } of forbidden) {
    if (markers.length === 0) problems.push(`no markers found for ${what}`)
    const hit = markers.find((marker) => code.includes(marker))
    if (hit) problems.push(`${file} contains ${what} ("${hit.slice(0, 40)}")`)
  }
}

// Discover, Book, and search load Zod only with a write or a form a Member opens (M10-T14).
for (const id of ['routes/home', 'routes/book', 'routes/search']) {
  for (const file of filesFor(id)) {
    const hit = forbidden[0].markers.find((marker) => read(file).includes(marker))
    if (hit) problems.push(`${id} loads ${file}, which contains Zod ("${hit}")`)
  }
}

const pages = {
  Discover: 'routes/home',
  Book: 'routes/book',
  Search: 'routes/search',
  'Log in': 'routes/login',
}
for (const [name, id] of Object.entries(pages)) {
  const files = filesFor(id)
  const raw = files.reduce((sum, file) => sum + Buffer.byteLength(read(file)), 0)
  const gzip = files.reduce((sum, file) => sum + gzipSync(read(file)).length, 0)
  console.log(
    `check-bundle: ${name.padEnd(8)} ${(gzip / 1024).toFixed(0).padStart(4)} KB gzip (${(raw / 1024).toFixed(0)} KB raw, ${files.length} files)`,
  )
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-bundle: ${problem}`)
  process.exit(1)
}
console.log(
  'check-bundle: OK, no Zod or admin, legal, or settings copy in the JavaScript every page loads, and no Zod on Discover, Book, or search',
)
