import { type Browser, expect, type Page, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { grantAdmin, registerVerifiedMember, setProfile } from '../support/accounts.js'
import { testPassword, useOwnClientIp } from '../support/identity.js'

/** Every admin page and the `h1` its band shows (D-201). */
const adminPages: [string, string][] = [
  ['/admin', 'Dashboard'],
  ['/admin/reviews', 'Review queue'],
  ['/admin/reports', 'Reports queue'],
  ['/admin/users', 'Users'],
  ['/admin/audit', 'Audit log'],
  ['/admin/catalog', 'Catalog'],
  ['/admin/catalog/merge', 'Merge queue'],
  ['/admin/catalog/genres', 'Genres and rules'],
  ['/admin/catalog/genres?tab=rules', 'Genres and rules'],
  ['/admin/featured', 'Featured content'],
  ['/admin/system', 'System'],
]

/** Fails naming the innermost elements whose content is wider than they are, so the culprit shows. */
async function expectNoSidewaysScroll(page: Page, label: string) {
  // Strings: the e2e package has no DOM types.
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  )
  if (overflow <= 0) return
  const culprits = await page.evaluate<string[]>(`
    [...document.body.querySelectorAll('*')]
      .filter((el) => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
      .filter((el) => ![...el.children].some((c) => c.scrollWidth > c.clientWidth + 1))
      .slice(0, 5)
      .map((el) => el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + ' "' + (el.textContent ?? '').slice(0, 40) + '"')
  `)
  expect(
    overflow,
    `${label} scrolls sideways; widest: ${culprits.join(' | ')}`,
  ).toBeLessThanOrEqual(0)
}

// The page sweeps and the role flow are separate tests: together they ran past the 30 s budget on
// WebKit in CI.
test('every admin page has no serious accessibility issues', async ({ page }) => {
  const admin = await registerVerifiedMember(page, 'admin')
  await grantAdmin(admin.email)
  for (const [path, title] of adminPages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expectNoA11yViolations(page)
  }
})

/** A Member at every length limit: no value has a space to break at, and W is the widest letter. */
async function registerLongNamedMember(browser: Browser) {
  const context = await browser.newContext()
  // 19 characters, `_`, and ten hex digits: a username at the 30-character limit.
  const member = await registerVerifiedMember(await context.newPage(), 'longusernamelongnam')
  expect(member.username).toHaveLength(30)
  const displayName = 'W'.repeat(50)
  await setProfile(member.email, { displayName, bio: 'W'.repeat(280) })
  return { ...member, displayName, close: () => context.close() }
}

test('the Users table fits beside the nav on a desktop', async ({ browser, page }) => {
  test.skip(test.info().project.name === 'mobile', 'phones get the row list instead')
  await page.setViewportSize({ width: 1440, height: 900 })
  const member = await registerLongNamedMember(browser)
  const admin = await registerVerifiedMember(page, 'adminwide')
  await grantAdmin(admin.email)
  await page.goto(`/admin/users?q=${member.username}`)
  const region = page.getByRole('region', { name: 'Users, scrollable table' })
  await expect(region.getByRole('link', { name: member.displayName })).toBeVisible()
  const overflow = await region.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await member.close()
})

test('admin pages never scroll sideways on a phone', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const admin = await registerVerifiedMember(page, 'adminphone')
  await grantAdmin(admin.email)
  for (const [path, title] of adminPages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expectNoSidewaysScroll(page, path)
    await expectNoA11yViolations(page)
  }
})

test('the longest names and reasons stay on screen on a phone', async ({ browser, page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const member = await registerLongNamedMember(browser)
  const { displayName } = member
  const admin = await registerVerifiedMember(page, 'adminlong')
  await grantAdmin(admin.email)

  await page.goto(`/admin/users?q=${member.username}`)
  await expect(page.getByRole('main').getByRole('link', { name: displayName })).toBeVisible()
  await expectNoSidewaysScroll(page, 'users list')

  await page.getByRole('main').getByRole('link', { name: displayName }).click()
  await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible()
  await page.getByRole('button', { name: 'Suspend', exact: true }).click()
  await page.getByLabel(/^Suspension reason/).fill(`Spam: https://example.test/${'w'.repeat(400)}`)
  await page.getByRole('button', { name: 'Suspend user' }).click()
  await expect(page.getByText('The user was suspended.')).toBeVisible()
  await expectNoSidewaysScroll(page, 'user detail')

  await page.goto('/admin/audit')
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
  await expectNoSidewaysScroll(page, 'audit log')
  await member.close()
})

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

  async function openUser(username: string) {
    await adminPage.goto(`/admin/users?q=${encodeURIComponent(username)}`)
    // The table on wider screens, the row list on phones (D-201); only one of them is shown.
    await adminPage
      .getByRole('main')
      .getByRole('link', { name: new RegExp(`^${username}\\b`) })
      .first()
      .click()
    await expect(adminPage.getByRole('heading', { level: 1, name: username })).toBeVisible()
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
  await expect(promotedPage.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible()

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
