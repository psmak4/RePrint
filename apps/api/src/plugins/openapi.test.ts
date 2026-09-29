import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { loadEnv } from '../config/env.js'
import { renderOpenApiSpec } from '../scripts/openapi.js'

function envFor(nodeEnv: 'test' | 'production') {
  return loadEnv({
    NODE_ENV: nodeEnv,
    WEB_ORIGINS: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
  })
}

describe('OpenAPI', () => {
  it('serves the docs outside production', async () => {
    const app = await buildApp(envFor('test'))
    const response = await app.inject({ method: 'GET', url: '/v1/docs/json' })
    expect(response.statusCode).toBe(200)
    expect(response.json().openapi).toBe('3.1.0')
    await app.close()
  })

  it('returns 404 Problem Details for the docs in production', async () => {
    const app = await buildApp(envFor('production'))
    for (const url of ['/v1/docs', '/v1/docs/json']) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/problem+json')
    }
    await app.close()
  })

  it('describes the routes from their Zod schemas', async () => {
    const spec = JSON.parse(await renderOpenApiSpec())
    expect(spec.openapi).toBe('3.1.0')
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/v1/health', '/v1/ready']))
  })
})
