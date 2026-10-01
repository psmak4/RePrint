import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import { openDunePage, registerVerifiedMember } from '../support/accounts.js'

const body = (text: string) =>
  `${text} A sweeping story of desert politics, ecology, and prophecy that rewards a slow read.`

test('a verified Member writes, edits, and deletes a review', async ({ page }) => {
  await registerVerifiedMember(page, 'reviewer')
  await openDunePage(page)

  const mine = page.getByRole('region', { name: 'Your review' })
  await expect(page.getByRole('heading', { name: 'Write a review' })).toBeVisible()
  await page.getByRole('button', { name: 'Write a review' }).click()
  await expectNoA11yViolations(page)

  // The star input is a radio group, so it works by keyboard.
  const stars = page.getByRole('radiogroup', { name: 'Your rating' })
  await stars.getByRole('radio', { name: '4 stars' }).check({ force: true })
  await expect(stars.getByRole('radio', { name: '4 stars' })).toBeChecked()
  await stars.getByRole('radio', { name: '4 stars' }).press('ArrowRight')
  await expect(stars.getByRole('radio', { name: '5 stars' })).toBeChecked()

  await page.getByLabel('Headline (optional)').fill('A desert classic')
  await page.getByLabel('Your review', { exact: true }).fill(body('First draft.'))
  await page.getByRole('button', { name: 'Submit for approval' }).click()

  await expect(mine.getByText('Pending approval')).toBeVisible()
  await expect(mine).toContainText('A desert classic')
  await expectNoA11yViolations(page)

  await mine.getByRole('button', { name: 'Edit your review' }).click()
  await expect(page.getByRole('heading', { name: 'Edit your review' })).toBeVisible()
  await expectNoA11yViolations(page)
  await page.getByLabel('Headline (optional)').fill('A desert classic, revised')
  await page.getByLabel('Your review', { exact: true }).fill(body('Second draft.'))
  await page.getByRole('button', { name: /for approval$/ }).click()

  await expect(mine).toContainText('A desert classic, revised')
  await expect(mine).toContainText('Second draft.')
  await expect(mine.getByText('Pending approval')).toBeVisible()

  await mine.getByRole('button', { name: 'Delete review' }).click()
  await expectNoA11yViolations(page)
  await mine.getByRole('button', { name: 'Yes, delete it' }).click()

  await expect(page.getByRole('heading', { name: 'Write a review' })).toBeVisible()
  await expect(page.getByText('A desert classic, revised')).toHaveCount(0)
})
