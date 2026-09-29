import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

describe('render.yaml', () => {
  const blueprint = read('render.yaml')

  it('runs the API with at least 2 instances and migrates before each deploy', () => {
    expect(blueprint).toMatch(/numInstances: ([2-9]|\d{2,})/)
    expect(blueprint).toContain('preDeployCommand: pnpm db:migrate')
  })

  it('defines the worker and a non-evicting Key Value store, all in Virginia', () => {
    expect(blueprint).toContain('type: worker')
    expect(blueprint).toContain('node dist/worker.js')
    expect(blueprint).toContain('keyValues:')
    expect(blueprint).toContain('maxmemoryPolicy: noeviction')
    const regions = [...blueprint.matchAll(/region: (\S+)/g)].map((match) => match[1])
    expect(regions.length).toBeGreaterThanOrEqual(3)
    expect(new Set(regions)).toEqual(new Set(['virginia']))
  })

  it('never commits secret values', () => {
    for (const key of ['DATABASE_URL', 'DATABASE_URL_DIRECT', 'SENTRY_DSN']) {
      expect(blueprint).toMatch(new RegExp(`key: ${key}\\n\\s+sync: false`))
    }
  })
})

describe('deploy-staging workflow', () => {
  const workflow = read('.github/workflows/deploy-staging.yml')

  it('runs on push to main and skips with a notice (not a failure) when unconfigured', () => {
    expect(workflow).toMatch(/push:\s+branches: \[main\]/)
    expect(workflow).toContain('::notice')
    expect(workflow).not.toMatch(/::error::.*not set up/)
  })

  it('migrates, deploys the API and worker, deploys the web app, then smoke-tests /v1/ready and /', () => {
    const order = ['pnpm db:migrate', 'RENDER_DEPLOY_HOOK_API_STAGING', 'netlify-cli', '/v1/ready']
    const positions = order.map((needle) =>
      workflow.indexOf(`${needle}`, workflow.indexOf('Migrate staging')),
    )
    expect(positions.every((position) => position > 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(workflow).toContain('STAGING_WEB_URL%/}/"')
  })

  it('documents every secret and variable it reads in docs/deploy.md', () => {
    const docs = read('docs/deploy.md')
    const names = new Set(
      [...workflow.matchAll(/\b(?:secrets|vars)\.([A-Z0-9_]+)/g)].map(
        (match) => match[1] as string,
      ),
    )
    expect(names.size).toBeGreaterThan(0)
    for (const name of names)
      expect(docs, `${name} missing from docs/deploy.md`).toContain(`\`${name}\``)
  })
})
