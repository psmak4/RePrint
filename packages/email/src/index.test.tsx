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
