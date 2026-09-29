import { describe, expect, it } from 'vitest'
import { SERVICE_NAME } from './server.js'

describe('api', () => {
  it('uses the shared app name', () => {
    expect(SERVICE_NAME).toBe('RePrint API')
  })
})
