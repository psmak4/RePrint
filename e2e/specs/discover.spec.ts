import { expect, test } from '@playwright/test'
import { createDb, series } from '@reprint/db'
import { expectNoA11yViolations } from '../support/a11y.js'

// Genres are reference data, so they exist on a fresh and on a seeded database. Discover rows
// appear only once the seed and a rebuild have run, so the home page is checked either way.

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://reprint:reprint@localhost:5432/reprint'

test('Discover home page links to all Genres and has no serious accessibility issues', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('browses from the Genres index to a Genre page and sorts it', async ({ page }) => {
  await page.goto('/genres')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.getByRole('main').locator('a[href^="/genres/"]').first().click()
  await expect(page).toHaveURL(/\/genres\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)

  await page.goto(`${new URL(page.url()).pathname}?sort=most_reviewed`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoA11yViolations(page)
})

test('a Series page renders and has no serious accessibility issues', async ({ page }) => {
  const slug = `e2e-series-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const client = createDb(databaseUrl, { max: 1 })
  try {
    await client.db.insert(series).values({ slug, name: 'E2E Series' })
  } finally {
    await client.close()
  }

  await page.goto(`/series/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Series' })).toBeVisible()
  await expectNoA11yViolations(page)
})
