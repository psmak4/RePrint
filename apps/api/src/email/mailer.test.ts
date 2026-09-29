import { beforeEach, describe, expect, it, vi } from 'vitest'

const resendSend = vi.hoisted(() => vi.fn())
const resendConstructor = vi.hoisted(() => vi.fn())
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend }
    constructor(apiKey: string) {
      resendConstructor(apiKey)
    }
  },
}))

import { createMailer } from './mailer.js'

const email = { to: 'ada@example.test', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }
const settings = {
  EMAIL_FROM: 'RePrint <no-reply@reprint.test>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
}

beforeEach(() => {
  resendSend.mockReset()
  resendConstructor.mockReset()
})

describe('createMailer (resend)', () => {
  it('sends through the Resend SDK with the configured sender', async () => {
    resendSend.mockResolvedValue({ data: { id: 'e1' }, error: null })
    const mailer = createMailer({
      ...settings,
      EMAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_test',
    })
    await mailer.send(email)
    expect(resendConstructor).toHaveBeenCalledWith('re_test')
    expect(resendSend).toHaveBeenCalledWith({ from: settings.EMAIL_FROM, ...email })
  })

  it('throws when Resend reports an error, so the job retries', async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'slow down' },
    })
    const mailer = createMailer({
      ...settings,
      EMAIL_TRANSPORT: 'resend',
      RESEND_API_KEY: 're_test',
    })
    await expect(mailer.send(email)).rejects.toThrow(/rate_limit_exceeded/)
  })

  it('needs an API key', () => {
    expect(() => createMailer({ ...settings, EMAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/)
  })
})

describe('createMailer (smtp)', () => {
  it('does not touch Resend', () => {
    const mailer = createMailer({ ...settings, EMAIL_TRANSPORT: 'smtp' })
    mailer.close()
    expect(resendConstructor).not.toHaveBeenCalled()
  })
})
