import { expect, test } from '@playwright/test'
import { expectNoA11yViolations } from '../support/a11y.js'
import {
  grantModerator,
  moveReviewToQueueFront,
  openDunePage,
  registerVerifiedMember,
  withQueueLock,
} from '../support/accounts.js'

const reviewText = (text: string) =>
  `${text} The worldbuilding is dense and patient, and the politics stay interesting to the end.`

test('a Moderator approves one review and rejects another with a reason', async ({ browser }) => {
  const reasonText = 'This review needs more detail about the book itself.'

  async function writeReview(prefix: string, headline: string) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const member = await registerVerifiedMember(page, prefix)
    await openDunePage(page)
    await page.getByRole('button', { name: 'Write a review' }).click()
    await page
      .getByRole('radiogroup', { name: 'Your rating' })
      .getByRole('radio', { name: '3 stars' })
      .check({ force: true })
    await page.getByLabel('Headline (optional)').fill(headline)
    await page.getByLabel('Your review', { exact: true }).fill(reviewText(headline))
    await page.getByRole('button', { name: 'Submit for approval' }).click()
    await expect(
      page.getByRole('region', { name: 'Your review' }).getByText('Pending approval'),
    ).toBeVisible()
    return { page, member }
  }

  const liked = await writeReview('liked', 'Liked it a lot')
  const disliked = await writeReview('disliked', 'Too thin to publish')

  const modContext = await browser.newContext()
  const modPage = await modContext.newPage()
  const moderator = await registerVerifiedMember(modPage, 'mod')
  await grantModerator(moderator.email)

  // Other specs decide from the same queue in parallel; the lock keeps their Moderators apart.
  await withQueueLock(async () => {
    const likedId = await moveReviewToQueueFront(liked.member.email)
    const dislikedId = await moveReviewToQueueFront(disliked.member.email)

    await modPage.goto('/admin/reviews')
    await modPage.locator(`a[href*="review=${likedId}"]`).click()
    await expect(modPage.getByRole('article', { name: 'Selected review' })).toContainText(
      'Liked it a lot',
    )
    await expectNoA11yViolations(modPage)
    await modPage.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(modPage.locator(`a[href*="review=${likedId}"]`)).toHaveCount(0)
    // The queue moves on (and claims the next review) before the lock is let go.
    await expect(modPage).not.toHaveURL(new RegExp(`review=${likedId}`))

    await modPage.goto('/admin/reviews')
    await modPage.locator(`a[href*="review=${dislikedId}"]`).click()
    await expect(modPage.getByRole('article', { name: 'Selected review' })).toContainText(
      'Too thin to publish',
    )
    await modPage.getByRole('button', { name: 'Reject', exact: true }).click()
    await expectNoA11yViolations(modPage)
    await modPage.getByLabel('Saved phrase').selectOption({ label: reasonText })
    await modPage.getByRole('button', { name: 'Reject review' }).click()
    await expect(modPage.locator(`a[href*="review=${dislikedId}"]`)).toHaveCount(0)
    await expect(modPage).not.toHaveURL(new RegExp(`review=${dislikedId}`))
  })

  // The approved author sees the review published, plus a notification.
  await liked.page.reload()
  const likedMine = liked.page.getByRole('region', { name: 'Your review' })
  await expect(likedMine.getByText('Approved', { exact: true })).toBeVisible()
  await liked.page
    .getByLabel(/^Notifications/)
    .first()
    .click()
  await expect(
    liked.page.getByText('Your review was approved and is now published.').first(),
  ).toBeVisible()
  await expectNoA11yViolations(liked.page)

  // The rejected author sees the reason and a notification.
  await disliked.page.reload()
  const dislikedMine = disliked.page.getByRole('region', { name: 'Your review' })
  await expect(dislikedMine.getByText('Rejected', { exact: true })).toBeVisible()
  await expect(dislikedMine).toContainText(reasonText)
  await disliked.page
    .getByLabel(/^Notifications/)
    .first()
    .click()
  await expect(disliked.page.getByText('Your review was not approved.').first()).toBeVisible()
  await expectNoA11yViolations(disliked.page)

  await Promise.all([liked.page, disliked.page, modPage].map((p) => p.context().close()))
})
