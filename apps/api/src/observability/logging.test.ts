import { Writable } from 'node:stream'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'
import { baseLoggerOptions } from './logging.js'

function capture() {
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()))
      callback()
    },
  })
  return { lines, log: pino(baseLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }), stream) }
}

describe('log redaction', () => {
  it('redacts cookie, authorization, password, and token fields', () => {
    const { lines, log } = capture()
    log.info(
      {
        cookie: 'rp_session=abc',
        authorization: 'Bearer abc',
        password: 'hunter2',
        token: 'tok',
        body: { password: 'hunter2', token: 'tok', email: 'a@example.com' },
        req: { headers: { cookie: 'rp_session=abc', authorization: 'Bearer abc', host: 'x' } },
        res: { headers: { 'set-cookie': 'rp_session=abc' } },
      },
      'sensitive',
    )
    const line = JSON.stringify(lines[0])
    for (const secret of ['rp_session=abc', 'Bearer abc', 'hunter2', '"tok"']) {
      expect(line).not.toContain(secret)
    }
    expect(lines[0]).toMatchObject({
      cookie: '[Redacted]',
      password: '[Redacted]',
      body: { email: 'a@example.com', password: '[Redacted]', token: '[Redacted]' },
      req: { headers: { host: 'x', cookie: '[Redacted]' } },
    })
  })
})
