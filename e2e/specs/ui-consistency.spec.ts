import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { grantAdmin, openDunePage, registerVerifiedMember } from '../support/accounts.js'
import { useOwnClientIp } from '../support/identity.js'

// M11 (D-214): every element has one look on every page. This measures each page type as drawn, in
// each browser project (the mobile project gives the phone sizes), and fails on anything outside
// the scale. `apps/web/app/style-guard.test.ts` keeps hand-built copies out of the code; this
// checks what the browser actually renders.

/** How a page opens: Discover's hero, the Book header, the auth card, or the shared band. */
type Frame = 'hero' | 'book' | 'auth' | 'band'

interface Measured {
  path: string
  problems: string[]
  sizes: Record<string, string[]>
}

const measureSource = readFileSync(new URL('../support/ui-measure.js', import.meta.url), 'utf8')
  // The browser runs it as a plain function.
  .replace('export function', 'function')

async function measure(page: Page, frame: Frame): Promise<Measured> {
  await page.waitForLoadState('networkidle')
  return page.evaluate<Measured>(`${measureSource}\nmeasureUi(${JSON.stringify(frame)})`)
}

async function check(page: Page, frame: Frame) {
  const result = await measure(page, frame)
  console.log(`ui ${test.info().project.name} ${result.path} ${JSON.stringify(result.sizes)}`)
  expect(result.problems, `${result.path}`).toEqual([])
}

/** The phone project runs at the smallest supported width (DESIGN.md: 360 px). */
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 360, height: 780 })
})

test('Visitor pages draw every element from the one scale', async ({ page }) => {
  await useOwnClientIp(page)
  await page.goto('/')
  await check(page, 'hero')

  await openDunePage(page)
  await check(page, 'book')

  await page.getByRole('main').locator('a[href^="/authors/"]').first().click()
  await expect(page).toHaveURL(/\/authors\//)
  await check(page, 'band')

  for (const path of ['/genres', '/search?q=dune', '/about', '/u/nobody-here/library']) {
    await page.goto(path)
    await check(page, 'band')
  }

  await page.goto('/genres')
  await page.getByRole('main').locator('a[href^="/genres/"]').first().click()
  await expect(page).toHaveURL(/\/genres\/[^/?]+/)
  await check(page, 'band')

  await page.goto('/login')
  await check(page, 'auth')

  await page.goto('/books/no-such-book-here')
  await check(page, 'auth')
})

test('Member and admin pages draw every element from the one scale', async ({ page }) => {
  const member = await registerVerifiedMember(page, 'ui')
  await grantAdmin(member.email)

  for (const path of [
    '/settings/profile',
    '/settings/security',
    `/u/${member.username}`,
    `/u/${member.username}/library`,
    '/admin',
    '/admin/users',
    '/admin/audit',
    '/admin/catalog/genres',
  ]) {
    await page.goto(path)
    await check(page, 'band')
  }

  // The account menu: its rows are one height, and it closes on Escape (D-214).
  await page.getByLabel('Account menu').click()
  const menu = page.getByLabel('Account menu').locator('xpath=..')
  for (const item of await menu.locator('a, button[type="submit"]').all()) {
    expect((await item.boundingBox())?.height).toBe(44)
  }
  await expect(menu.getByRole('link', { name: 'Admin' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).not.toHaveAttribute('open', '')
})
