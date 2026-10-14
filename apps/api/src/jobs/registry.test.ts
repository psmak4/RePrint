import type { Database } from '@reprint/db'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import type { ImageStorage } from '../storage/index.js'
import { recordingMailer } from '../testing/mailer.js'
import { isJobName, type JobContext, jobs } from './registry.js'

// These handlers never touch the database or storage.
const unusedServices = {
  db: {} as Database,
  redis: {} as Redis,
  storage: {} as ImageStorage,
  catalog: {} as JobContext['catalog'],
  queue: {} as Queue,
  enqueue: async () => 'unused',
  enqueueMany: async () => [],
  sourceRps: 2,
  alert: () => {},
}

describe('job registry', () => {
  it('recognizes registered names only', () => {
    expect(isJobName('system.heartbeat')).toBe(true)
    expect(isJobName('catalog.series-sync')).toBe(true)
    expect(isJobName('toString')).toBe(false)
    expect(isJobName('nope')).toBe(false)
  })

  it('validates the Series sync payload', () => {
    const payload = jobs['catalog.series-sync'].payload
    expect(payload.safeParse({ seriesId: 'x' }).success).toBe(false)
    expect(payload.safeParse({ seriesId: '0192a3b4-0000-7000-8000-000000000001' }).success).toBe(
      true,
    )
  })

  it('knows the Author bibliography jobs and checks their payloads (D-203)', () => {
    expect(isJobName('catalog.author-sync')).toBe(true)
    expect(isJobName('catalog.author-book')).toBe(true)
    const id = '0192a3b4-0000-7000-8000-000000000001'
    expect(jobs['catalog.author-sync'].payload.safeParse({ authorId: 'x' }).success).toBe(false)
    expect(jobs['catalog.author-sync'].payload.safeParse({ authorId: id }).success).toBe(true)
    expect(
      jobs['catalog.author-book'].payload.safeParse({ authorId: id, sourceId: '' }).success,
    ).toBe(false)
    expect(
      jobs['catalog.author-book'].payload.safeParse({ authorId: id, sourceId: 'source-book-1' })
        .success,
    ).toBe(true)
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
    const result = await jobs['system.heartbeat'].handler(
      {},
      { log: pino({ level: 'silent' }), mailer: recordingMailer().mailer, ...unusedServices },
    )
    expect(new Date(result.at).toString()).not.toBe('Invalid Date')
  })

  describe('email.send', () => {
    const payload = {
      template: 'verify-email',
      to: 'ada@example.test',
      props: { username: 'ada_l', verifyUrl: 'https://www.reprint.test/verify-email?token=t' },
    } as const

    it('renders the template and hands it to the mailer', async () => {
      const { mailer, sent } = recordingMailer()
      const parsed = jobs['email.send'].payload.parse(payload)
      await jobs['email.send'].handler(parsed, {
        log: pino({ level: 'silent' }),
        mailer,
        ...unusedServices,
      })
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({
        to: 'ada@example.test',
        subject: 'Verify your email address',
      })
      expect(sent[0]?.html).toContain('https://www.reprint.test/verify-email?token=t')
      expect(sent[0]?.text).toContain('ada_l')
    })

    it('rejects an unknown template, a bad address, and bad props', () => {
      const schema = jobs['email.send'].payload
      expect(schema.safeParse({ ...payload, template: 'nope' }).success).toBe(false)
      expect(schema.safeParse({ ...payload, to: 'not-an-email' }).success).toBe(false)
      expect(schema.safeParse({ ...payload, props: { username: 'x' } }).success).toBe(false)
    })

    it('retries failures', () => {
      expect(jobs['email.send'].retry?.attempts).toBeGreaterThan(1)
    })
  })
})
