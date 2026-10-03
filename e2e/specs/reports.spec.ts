import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import {
  grantModerator,
  moveReportsToQueueFront,
  moveReviewToQueueFront,
  openDunePage,
  registerVerifiedMember,
  restoreReviewSubmittedAt,
} from '../support/accounts.js'

test('a Member reports a review, a Moderator unpublishes it, and the author is told', async ({
  browser,
}) => {
  const headline = `Reported take ${Date.now()}`
  const reason = 'This review is advertising a product instead of discussing the book.'

  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const author = await registerVerifiedMember(authorPage, 'reported')
  await openDunePage(authorPage)
  await authorPage.getByRole('button', { name: 'Write a review' }).click()
  await authorPage
    .getByRole('radiogroup', { name: 'Your rating' })
    .getByRole('radio', { name: '2 stars' })
    .check({ force: true })
  await authorPage.getByLabel('Headline (optional)').fill(headline)
  await authorPage
    .getByLabel('Your review', { exact: true })
    .fill(`${headline}. Buy my other product today, it is far better than this long book.`)
  await authorPage.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(
    authorPage.getByRole('region', { name: 'Your review' }).getByText('Pending approval'),
  ).toBeVisible()

  // A Moderator approves it through the review queue, which keeps the Book's aggregates right.
  const modContext = await browser.newContext()
  const modPage = await modContext.newPage()
  const moderator = await registerVerifiedMember(modPage, 'reportmod')
  await grantModerator(moderator.email)
  const reviewId = await moveReviewToQueueFront(author.email)
  await modPage.goto('/admin/reviews')
  await modPage.locator(`a[href*="review=${reviewId}"]`).click()
  await modPage.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(modPage.locator(`a[href*="review=${reviewId}"]`)).toHaveCount(0)
  await restoreReviewSubmittedAt(author.email)

  // Another Member reports it from the Book page.
  const reporterContext = await browser.newContext()
  const reporterPage = await reporterContext.newPage()
  await registerVerifiedMember(reporterPage, 'reporter')
  await openDunePage(reporterPage)
  await reporterPage.goto(`${new URL(reporterPage.url()).pathname}?sort=newest`)
  const reported = reporterPage.getByRole('listitem').filter({ hasText: headline })
  await reported.getByRole('button', { name: 'Report', exact: true }).click()
  const dialog = reporterPage.getByRole('dialog', { name: 'Report this review' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Spam or advertising').check()
  await expectNoA11yViolations(reporterPage)
  await dialog.getByRole('button', { name: 'Send report' }).click()
  await expect(dialog.getByRole('status')).toContainText('Thank you')

  // A Moderator finds it in the reports queue and unpublishes it with a reason.
  await moveReportsToQueueFront(author.email)
  await modPage.goto('/admin/reports')
  const item = modPage.getByRole('article').filter({ hasText: headline })
  await expect(item).toContainText('Spam or advertising')
  await expectNoA11yViolations(modPage)
  await item.getByRole('button', { name: 'Unpublish', exact: true }).click()
  await item.getByLabel(/^Reason/).fill(reason)
  await item.getByRole('button', { name: 'Unpublish review' }).click()
  // Its reports are resolved, so the review leaves the queue.
  await expect(item).toHaveCount(0)

  // The author sees the review taken down, plus a notification.
  await authorPage.reload()
  await expect(
    authorPage.getByRole('region', { name: 'Your review' }).getByText('Unpublished', {
      exact: true,
    }),
  ).toBeVisible()
  await authorPage
    .getByLabel(/^Notifications/)
    .first()
    .click()
  await expect(authorPage.getByText('Your review was unpublished.').first()).toBeVisible()
  await expectNoA11yViolations(authorPage)

  await Promise.all([authorContext, reporterContext, modContext].map((c) => c.close()))
})
