import { z } from 'zod'
import { reportStatusSchema, reviewReportReasonSchema, reviewStatusSchema } from './reviews.js'
import { shelfSchema } from './shelves.js'

/** The Member's data download (PRD §11): everything RePrint holds about them, and nobody else's. */

const bookRefSchema = z.object({ slug: z.string(), title: z.string() })

export const exportReviewVersionSchema = z.object({
  version: z.number().int().min(1),
  rating: z.number().int().min(1).max(5),
  headline: z.string().nullable(),
  body: z.string(),
  hasSpoilers: z.boolean(),
  status: reviewStatusSchema,
  decisionReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

export const exportReviewSchema = z.object({
  id: z.uuid(),
  book: bookRefSchema,
  rating: z.number().int().min(1).max(5),
  headline: z.string().nullable(),
  body: z.string(),
  hasSpoilers: z.boolean(),
  status: reviewStatusSchema,
  helpfulCount: z.number().int().min(0),
  submittedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
  versions: z.array(exportReviewVersionSchema),
})

export const memberExportSchema = z.object({
  exportedAt: z.iso.datetime(),
  account: z.object({
    id: z.uuid(),
    email: z.string(),
    username: z.string(),
    verified: z.boolean(),
    emailReviewDecisions: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
  profile: z.object({
    displayName: z.string(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    libraryPublic: z.boolean(),
  }),
  reviews: z.array(exportReviewSchema),
  /** Reviews this Member marked helpful. */
  helpfulVotes: z.array(
    z.object({ reviewId: z.uuid(), book: bookRefSchema, createdAt: z.iso.datetime() }),
  ),
  /** Reports this Member filed on other Members' reviews (PRD §7.9). */
  reports: z.array(
    z.object({
      id: z.uuid(),
      reviewId: z.uuid(),
      book: bookRefSchema,
      reason: reviewReportReasonSchema,
      note: z.string().nullable(),
      status: reportStatusSchema,
      createdAt: z.iso.datetime(),
    }),
  ),
  library: z.array(
    z.object({
      book: bookRefSchema,
      shelf: shelfSchema,
      addedAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }),
  ),
  notifications: z.array(
    z.object({
      id: z.uuid(),
      type: z.string(),
      data: z.record(z.string(), z.unknown()),
      readAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      ip: z.string().nullable(),
      userAgent: z.string().nullable(),
      createdAt: z.iso.datetime(),
      lastSeenAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
    }),
  ),
})
export type MemberExport = z.infer<typeof memberExportSchema>
