import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const accountDeletionScheduledProps = z.object({
  username: z.string().min(1),
  /** Days until the account and everything on it is erased. */
  eraseAfterDays: z.number().int().min(1),
})

export type AccountDeletionScheduledProps = z.infer<typeof accountDeletionScheduledProps>

export const accountDeletionScheduledSubject = 'Your RePrint account is scheduled for deletion'

export function AccountDeletionScheduled({
  username,
  eraseAfterDays,
}: AccountDeletionScheduledProps) {
  return (
    <BaseLayout
      preview="Your RePrint account was disabled and will be erased"
      heading="Account scheduled for deletion"
    >
      <Text>Hi {username},</Text>
      <Text>
        Your RePrint account was disabled and signed out everywhere. In {eraseAfterDays} days it
        will be permanently erased, together with your reviews, votes, reports, and library. This
        cannot be undone.
      </Text>
    </BaseLayout>
  )
}
