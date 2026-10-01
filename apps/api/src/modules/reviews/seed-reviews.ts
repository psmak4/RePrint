import {
  books,
  type Database,
  type NewReview,
  reviews,
  reviewVersions,
  roles,
  type SeedRandom,
  userRoles,
  users,
} from '@reprint/db'
import type { ReviewStatus } from '@reprint/shared'
import { and, asc, eq, inArray, isNotNull, notInArray } from 'drizzle-orm'
import { applyReviewChange } from './aggregates.js'

/** One number drives every seeded review, so two seeds create the same reviews. */
export const REVIEWS_SEED = 20260103

const BOOKS_WITH_REVIEWS = 40
const REVIEWS_PER_BOOK = [2, 5] as const
const DAY_MS = 24 * 60 * 60 * 1000

type VersionPlan = { status: ReviewStatus; reason?: string }

/**
 * How a seeded Review got to where it is: one entry per version, oldest first. The Review's own
 * status is the last version's, except that an edit of an Approved review is Pending until decided.
 * The list repeats, so every state shows up in the sample data.
 */
const SCENARIOS: readonly (readonly VersionPlan[])[] = [
  ...Array.from({ length: 10 }, () => [{ status: 'approved' }] as const),
  [{ status: 'approved' }, { status: 'approved' }],
  [{ status: 'approved' }, { status: 'approved' }, { status: 'approved' }],
  [{ status: 'approved' }, { status: 'pending' }],
  [{ status: 'pending' }],
  [{ status: 'pending' }],
  [{ status: 'pending' }],
  [{ status: 'rejected', reason: 'This reads as an ad rather than a review of the book.' }],
  [{ status: 'rejected' }],
  [
    { status: 'rejected', reason: 'Please describe the book itself, not the seller.' },
    { status: 'pending' },
  ],
  [{ status: 'rejected' }, { status: 'approved' }],
  [{ status: 'approved' }, { status: 'unpublished', reason: 'Removed after a Member report.' }],
]

const OPENERS = [
  'I picked this up on a recommendation and finished it in two sittings.',
  'The first fifty pages are slow, but the book rewards patience.',
  'This is not what I expected from the cover, in a good way.',
  'I read it on a long train ride and missed my stop.',
  'The prose is plain and the story is not.',
] as const
const MIDDLES = [
  'The characters feel like people you have actually met.',
  'The pacing slips in the middle, then recovers with a strong final act.',
  'Some of the dialogue is stiff, but the setting more than makes up for it.',
  'The ending left me thinking about it for days afterward.',
  'It handles a hard subject with care and a little humour.',
] as const
const HEADLINES = [
  'Worth the time',
  'A slow burn',
  'Better than expected',
  'Not for everyone',
] as const

function pick<T>(random: SeedRandom, items: readonly T[]): T {
  return items[random.int(0, items.length - 1)] as T
}

function reviewText(random: SeedRandom) {
  return {
    headline: random.int(0, 2) === 0 ? null : pick(random, HEADLINES),
    body: `${pick(random, OPENERS)} ${pick(random, MIDDLES)} ${pick(random, MIDDLES)}`,
    rating: random.int(1, 5),
    hasSpoilers: random.int(0, 9) === 0,
  }
}

export interface SeedReviewsResult {
  reviews: number
  versions: number
  skipped: boolean
}

/**
 * Adds sample reviews in every status (Pending, Approved, Rejected with and without a reason, and
 * Unpublished), including edited reviews with several versions. Totals on each Book are updated by
 * `applyReviewChange`, the same call the API makes, in the same transaction. Does nothing when any
 * review already exists. Needs the users and Catalog seeds to have run.
 */
export async function seedReviews(
  db: Database,
  random: SeedRandom,
  log: (message: string) => void = () => {},
): Promise<SeedReviewsResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: reviews.id }).from(reviews).limit(1)
    if (existing) {
      log('review seed: reviews already exist, nothing to do')
      return { reviews: 0, versions: 0, skipped: true }
    }

    // Moderators and Admins decide; every other verified, active account can write reviews.
    const staff = tx
      .select({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(roles.name, ['moderator', 'admin']))
    const reviewers = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          isNotNull(users.emailVerifiedAt),
          notInArray(users.id, staff),
        ),
      )
      .orderBy(asc(users.username))
    const moderators = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(roles.name, 'moderator'))
      .orderBy(asc(users.username))
    const bookRows = await tx
      .select({ id: books.id })
      .from(books)
      .orderBy(asc(books.slug))
      .limit(BOOKS_WITH_REVIEWS)
    const firstModerator = moderators[0]
    if (!firstModerator || reviewers.length === 0 || bookRows.length === 0) {
      throw new Error('review seed needs the users seed and the Catalog seed to have run first')
    }

    const now = random.now().getTime()
    const reviewRows: NewReview[] = []
    const versionRows: (typeof reviewVersions.$inferInsert)[] = []
    const approved: { bookId: string; rating: number }[] = []
    let scenarioIndex = 0

    for (const book of bookRows) {
      // Each reviewer reviews a Book at most once.
      const pool = [...reviewers]
      const count = Math.min(random.int(REVIEWS_PER_BOOK[0], REVIEWS_PER_BOOK[1]), pool.length)
      for (let i = 0; i < count; i++) {
        const reviewer = pool.splice(random.int(0, pool.length - 1), 1)[0]
        if (!reviewer) break
        const plan = SCENARIOS[scenarioIndex++ % SCENARIOS.length] ?? []
        const reviewId = random.id()
        let submittedAt = now - random.int(5, 200) * DAY_MS
        let latest = reviewText(random)
        let decidedAt: Date | null = null

        plan.forEach((step, index) => {
          if (index > 0) {
            submittedAt += random.int(1, 20) * DAY_MS
            latest = reviewText(random)
          }
          const decided = step.status !== 'pending'
          const decidedOn = decided ? new Date(submittedAt + random.int(1, 48) * 3_600_000) : null
          const moderator = pick(random, moderators)
          versionRows.push({
            id: random.id(),
            reviewId,
            version: index + 1,
            ...latest,
            status: step.status,
            decidedBy: decided ? moderator.id : null,
            decisionReason: step.reason ?? null,
            decidedAt: decidedOn,
            createdAt: new Date(submittedAt),
          })
          decidedAt = decidedOn
        })

        const last = plan[plan.length - 1]
        if (!last) continue
        reviewRows.push({
          id: reviewId,
          userId: reviewer.id,
          bookId: book.id,
          ...latest,
          status: last.status,
          submittedAt: new Date(submittedAt),
          decidedAt,
          createdAt: new Date(now - 250 * DAY_MS),
          updatedAt: new Date(submittedAt),
        })
        if (last.status === 'approved') approved.push({ bookId: book.id, rating: latest.rating })
      }
    }

    await tx.insert(reviews).values(reviewRows)
    await tx.insert(reviewVersions).values(versionRows)
    for (const review of approved) {
      await applyReviewChange(tx, review.bookId, null, {
        status: 'approved',
        rating: review.rating,
      })
    }
    log(`review seed: ${reviewRows.length} reviews, ${versionRows.length} versions`)
    return { reviews: reviewRows.length, versions: versionRows.length, skipped: false }
  })
}
