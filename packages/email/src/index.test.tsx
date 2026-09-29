import { describe, expect, it } from 'vitest'
import { emailTemplates, renderEmail } from './index.js'

const props = { username: 'ada_l', verifyUrl: 'https://www.reprint.test/verify-email?token=abc123' }

describe('renderEmail', () => {
  it('renders the verify-email template to HTML and text', async () => {
    const email = await renderEmail('verify-email', props)
    expect(email.subject).toBe('Verify your email address')
    expect(email.html).toContain('<html dir="ltr" lang="en">')
    expect(email.html).toContain(props.verifyUrl)
    expect(email.text).toContain('Hi ada_l,')
    expect(email.text).toContain(props.verifyUrl)
    expect(email.text).not.toContain('<')
    expect(email.html).toMatchSnapshot()
    expect(email.text).toMatchSnapshot()
  })

  it('renders the email-already-registered template', async () => {
    const email = await renderEmail('email-already-registered', {
      username: 'ada_l',
      loginUrl: 'https://www.reprint.test/login',
    })
    expect(email.subject).toBe('Someone tried to register with your email')
    expect(email.text).toContain('Hi ada_l,')
    expect(email.text).toContain('https://www.reprint.test/login')
  })

  it('renders the password-reset and password-changed templates', async () => {
    const reset = await renderEmail('password-reset', {
      username: 'ada_l',
      resetUrl: 'https://www.reprint.test/reset-password?token=abc',
    })
    expect(reset.subject).toBe('Reset your password')
    expect(reset.text).toContain('https://www.reprint.test/reset-password?token=abc')
    expect(reset.text).toContain('1 hour')
    const changed = await renderEmail('password-changed', {
      username: 'ada_l',
      resetUrl: 'https://www.reprint.test/forgot-password',
    })
    expect(changed.subject).toBe('Your password was changed')
    expect(changed.text).toContain('https://www.reprint.test/forgot-password')
  })

  it('renders the email change templates', async () => {
    const confirm = await renderEmail('email-change-confirm', {
      username: 'ada_l',
      confirmUrl: 'https://www.reprint.test/confirm-email-change?token=abc',
    })
    expect(confirm.subject).toBe('Confirm your new email address')
    expect(confirm.text).toContain('https://www.reprint.test/confirm-email-change?token=abc')
    const requested = await renderEmail('email-change-requested', {
      username: 'ada_l',
      newEmail: 'new@example.test',
      resetUrl: 'https://www.reprint.test/forgot-password',
    })
    expect(requested.text).toContain('new@example.test')
    const changed = await renderEmail('email-changed', {
      username: 'ada_l',
      oldEmail: 'old@example.test',
      newEmail: 'new@example.test',
      resetUrl: 'https://www.reprint.test/forgot-password',
    })
    expect(changed.text).toContain('old@example.test')
    expect(changed.text).toContain('new@example.test')
  })

  it('escapes user-controlled text in HTML', async () => {
    const email = await renderEmail('verify-email', { ...props, username: '<script>x</script>' })
    expect(email.html).not.toContain('<script>x')
  })

  it('rejects invalid props', async () => {
    await expect(renderEmail('verify-email', { username: '', verifyUrl: 'nope' })).rejects.toThrow()
  })

  it('has a subject for every template', () => {
    for (const template of Object.values(emailTemplates))
      expect(template.subject().length).toBeGreaterThan(0)
  })
})
