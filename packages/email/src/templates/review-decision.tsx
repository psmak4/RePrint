import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const reviewDecisionProps = z.object({
  username: z.string().min(1),
  bookTitle: z.string().min(1),
  decision: z.enum(['approved', 'rejected', 'unpublished']),
  /** The Moderator's reason, when they gave one. */
  reason: z.string().min(1).optional(),
  /** The Book page, where an approved Review appears or a rejected or unpublished one can be edited. */
  bookUrl: z.url(),
})

export type ReviewDecisionProps = z.infer<typeof reviewDecisionProps>

export const reviewDecisionSubject = 'A moderator decided on your review'

export function ReviewDecision({
  username,
  bookTitle,
  decision,
  reason,
  bookUrl,
}: ReviewDecisionProps) {
  const approved = decision === 'approved'
  return (
    <BaseLayout
      preview={`Your review of ${bookTitle} was ${decision}`}
      heading={
        approved
          ? 'Your review is live'
          : decision === 'unpublished'
            ? 'Your review was unpublished'
            : 'Your review was not published'
      }
    >
      <Text>Hi {username},</Text>
      {approved ? (
        <Text>
          A moderator approved your review of {bookTitle}, and it now appears on the Book page:{' '}
          {bookUrl}
        </Text>
      ) : (
        <>
          <Text>
            {decision === 'unpublished'
              ? `A moderator unpublished your review of ${bookTitle}.`
              : `A moderator did not approve your review of ${bookTitle}.`}
            {reason ? ` Reason: ${reason}` : ''}
          </Text>
          <Text>You can edit it and submit it again: {bookUrl}</Text>
        </>
      )}
    </BaseLayout>
  )
}
