import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'

// The stub Source (SOURCE_MODE=stub) offers Dune and The Hobbit. The three projects share one
// database and run in parallel, so each step works whether or not another project has already
// brought the Book into the Catalog.

test('searches, opens a not-yet-stored result, and finds the Book in the Catalog afterwards', async ({
  page,
}) => {
  await page.goto('/')
  const search = page.getByRole('combobox', { name: 'Search books and authors' })
  await search.fill('Dune')
  await search.press('Enter')

  await expect(page).toHaveURL(/\/search\?q=Dune/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const result = page.getByRole('main').getByRole('link', { name: /Dune/ }).first()
  await expect(result).toBeVisible()
  await expectNoA11yViolations(page)

  // A result that is not yet on RePrint goes through /resolve and lands on the new Book page.
  await result.click()
  await expect(page).toHaveURL(/\/books\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Dune' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Frank Herbert')
  await expectNoA11yViolations(page)

  // The Book is now in the Catalog, so the same search links straight to it.
  await page.goto('/search?q=Dune')
  await expect(page.getByRole('main').getByRole('link', { name: /Dune/ }).first()).toHaveAttribute(
    'href',
    /^\/books\/[^/?]+$/,
  )
  await expectNoA11yViolations(page)
})

test('an ISBN search lands directly on the Book page', async ({ page }) => {
  await page.goto('/search?q=9780547928227')
  await expect(page).toHaveURL(/\/books\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'The Hobbit' })).toBeVisible()
  await expectNoA11yViolations(page)
})
