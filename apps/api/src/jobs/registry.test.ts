import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { isJobName, jobs } from './registry.js'

describe('job registry', () => {
  it('recognizes registered names only', () => {
    expect(isJobName('system.heartbeat')).toBe(true)
    expect(isJobName('toString')).toBe(false)
    expect(isJobName('nope')).toBe(false)
  })

  it('rejects an invalid payload', () => {
    expect(jobs['system.heartbeat'].payload.safeParse({ note: 5 }).success).toBe(false)
  })

  it('has a valid payload for every schedule', () => {
    for (const definition of Object.values(jobs)) {
      if ('schedule' in definition && definition.schedule) {
        expect(definition.payload.safeParse(definition.schedule.payload).success).toBe(true)
        expect(definition.schedule.everyMs).toBeGreaterThan(0)
      }
    }
  })

  it('heartbeat returns the time it ran', async () => {
    const result = await jobs['system.heartbeat'].handler({}, { log: pino({ level: 'silent' }) })
    expect(new Date(result.at).toString()).not.toBe('Invalid Date')
  })
})
