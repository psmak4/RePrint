import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { newIdentity, testPassword, useOwnClientIp } from '../support/identity.js'
import { linkInEmail, waitForEmail } from '../support/mailpit.js'

test('requests a reset, follows the emailed link, and logs in with the new password', async ({
  page,
}) => {
  await useOwnClientIp(page)
  const { email, username } = newIdentity('reset')
  const newPassword = 'a brand new passphrase 42'

  await page.goto('/register')
  // Fill only after hydration, or the form resets and submits empty.
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByLabel('Account menu')).toBeVisible()
  await page.getByLabel('Account menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()

  await page.goto('/forgot-password')
  await expectNoA11yViolations(page)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  const message = await waitForEmail(email, /reset/i)
  await page.goto(linkInEmail(message, '/reset-password'))
  await expectNoA11yViolations(page)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Set new password' }).click()
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByLabel('Account menu')).toBeVisible()

  // The old password no longer works (reset ended every session and replaced the hash).
  await page.getByLabel('Account menu').click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(testPassword)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})
