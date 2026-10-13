import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { grantAdmin, openDunePage, registerVerifiedMember } from '../support/accounts.js'
import { useOwnClientIp } from '../support/identity.js'

// The page types that other specs do not already check with axe (PRD §11, §12). Discover, search,
// Book (with reviews), Genre, Series, profile, library, auth, and most admin pages are covered in
// their own specs; this one fills the gaps so every page type has a check.

const apiOrigin = process.env.E2E_API_ORIGIN ?? 'http://api.reprint.localhost:3000'

const legalPages = [
  { path: '/about', heading: 'About RePrint' },
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/community-guidelines', heading: 'Community Guidelines' },
  { path: '/contact', heading: 'Contact' },
]

test('legal and static pages have no serious accessibility issues', async ({ page }) => {
  await useOwnClientIp(page)
  for (const { path, heading } of legalPages) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expectNoA11yViolations(page)
  }
})

test('Author page and a Book page have no serious accessibility issues', async ({ page }) => {
  await openDunePage(page)
  await expectNoA11yViolations(page)

  await page.getByRole('main').locator('a[href^="/authors/"]').first().click()
  await expect(page).toHaveURL(/\/authors\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)
})

// The stub Source writes Tolkien's bio in Markdown with a reference link, as Open Library does.
test('an Author bio renders its Markdown, with an outside link (D-202)', async ({ page }) => {
  // Its own client IP, so its searches do not count against the per-IP search limit that the other
  // anonymous specs share.
  await useOwnClientIp(page)
  await page.goto('/search?q=hobbit')
  await page
    .getByRole('main')
    .getByRole('link', { name: /The Hobbit/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'J. R. R. Tolkien' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'J. R. R. Tolkien' })).toBeVisible()

  const bio = page.getByRole('region', { name: 'About the author' })
  const source = bio.getByRole('link', { name: 'source' })
  await expect(source).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/J._R._R._Tolkien')
  await expect(source).toHaveAttribute('rel', 'nofollow ugc noopener noreferrer')
  await expect(bio.locator('em')).toHaveText('The Hobbit')
  await expect(bio).not.toContainText('[1]')
  // Search engines get the plain text.
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'English writer and philologist, best known for The Hobbit. (source)',
  )
  await expectNoA11yViolations(page)
})

test('settings pages have no serious accessibility issues', async ({ page }) => {
  await registerVerifiedMember(page, 'a11y')
  for (const path of ['/settings/profile', '/settings/security']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoA11yViolations(page)
  }
})

test('admin Book edit page has no serious accessibility issues', async ({ page }) => {
  const admin = await registerVerifiedMember(page, 'a11yadmin')
  await grantAdmin(admin.email)

  await openDunePage(page)
  const slug = new URL(page.url()).pathname.split('/').pop()
  const response = await page.request.get(`${apiOrigin}/v1/books/${slug}`)
  expect(response.ok()).toBe(true)
  const { id } = (await response.json()) as { id: string }

  await page.goto(`/admin/books/${id}`)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Edit Book')
  await expect(page.getByRole('heading', { level: 1, name: 'Dune' })).toBeVisible()
  await expectNoA11yViolations(page)
})
