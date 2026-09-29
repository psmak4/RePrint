import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { newIdentity, testPassword, useOwnClientIp } from '../support/identity.js'
import { linkInEmail, waitForEmail } from '../support/mailpit.js'

test('registers, verifies the email, logs out, and logs in', async ({ page }) => {
  await useOwnClientIp(page)
  const { email, username } = newIdentity('auth')

  await page.goto('/register')
  await expectNoA11yViolations(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Registration signs the Member in, but they are unverified until the link is used.
  await expect(page.getByRole('region', { name: 'Email verification' })).toBeVisible()
  await expectNoA11yViolations(page)

  const message = await waitForEmail(email, /confirm|verify/i)
  await page.goto(linkInEmail(message, '/verify-email'))
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Email verification' })).toHaveCount(0)

  await page.getByLabel('Account menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()

  await page.goto('/login')
  await expectNoA11yViolations(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByLabel('Account menu')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Email verification' })).toHaveCount(0)
})
