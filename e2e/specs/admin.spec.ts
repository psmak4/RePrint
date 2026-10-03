import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { grantAdmin, registerVerifiedMember } from '../support/accounts.js'
import { testPassword, useOwnClientIp } from '../support/identity.js'

const adminPages = [
  '/admin',
  '/admin/reviews',
  '/admin/reports',
  '/admin/users',
  '/admin/audit',
  '/admin/catalog',
  '/admin/catalog/merge',
  '/admin/catalog/genres',
  '/admin/featured',
  '/admin/system',
]

test('an Admin grants Moderator to one Member and suspends another, who cannot log in', async ({
  browser,
}) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const admin = await registerVerifiedMember(adminPage, 'admin')
  await grantAdmin(admin.email)

  const promotedContext = await browser.newContext()
  const promoted = await registerVerifiedMember(await promotedContext.newPage(), 'promote')
  const suspendedContext = await browser.newContext()
  const suspended = await registerVerifiedMember(await suspendedContext.newPage(), 'suspendme')

  for (const path of adminPages) {
    await adminPage.goto(path)
    await expect(adminPage.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible()
    await expectNoA11yViolations(adminPage)
  }

  async function openUser(username: string) {
    await adminPage.goto(`/admin/users?q=${encodeURIComponent(username)}`)
    await adminPage
      .getByRole('row')
      .filter({ hasText: `@${username}` })
      .getByRole('link')
      .click()
    await expect(adminPage.getByRole('heading', { level: 2, name: username })).toBeVisible()
  }

  await openUser(promoted.username)
  await expectNoA11yViolations(adminPage)
  await adminPage.getByRole('button', { name: 'Make Moderator' }).click()
  await expect(adminPage.getByText('The role was granted.')).toBeVisible()
  await expect(adminPage.getByRole('button', { name: 'Remove Moderator role' })).toBeVisible()

  await openUser(suspended.username)
  await adminPage.getByRole('button', { name: 'Suspend', exact: true }).click()
  await adminPage.getByLabel(/^Suspension reason/).fill('Repeated spam in reviews.')
  await adminPage.getByRole('button', { name: 'Suspend user' }).click()
  await expect(adminPage.getByText('The user was suspended.')).toBeVisible()

  // The promoted Member now reaches the Moderator pages.
  const promotedPage = promotedContext.pages()[0]
  if (!promotedPage) throw new Error('missing page')
  await promotedPage.goto('/admin/reviews')
  await expect(
    promotedPage.getByRole('heading', { level: 1, name: 'Administration' }),
  ).toBeVisible()

  // The suspended Member can no longer log in.
  const freshContext = await browser.newContext()
  const freshPage = await freshContext.newPage()
  await useOwnClientIp(freshPage)
  await freshPage.goto('/login')
  await freshPage.getByLabel('Email').fill(suspended.email)
  await freshPage.getByLabel('Password').fill(testPassword)
  await freshPage.getByRole('button', { name: 'Log in' }).click()
  await expect(freshPage.getByText(/This account is suspended/)).toBeVisible()
  await expect(freshPage.getByLabel('Account menu')).toHaveCount(0)

  await Promise.all(
    [adminContext, promotedContext, suspendedContext, freshContext].map((c) => c.close()),
  )
})
