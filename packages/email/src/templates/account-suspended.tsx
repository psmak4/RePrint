import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const accountSuspendedProps = z.object({
  username: z.string().min(1),
  reason: z.string().min(1),
  /** Date the suspension ends (`YYYY-MM-DD`); omitted when it has no end date. */
  until: z.string().optional(),
})

export type AccountSuspendedProps = z.infer<typeof accountSuspendedProps>

export const accountSuspendedSubject = 'Your RePrint account was suspended'

export function AccountSuspended({ username, reason, until }: AccountSuspendedProps) {
  return (
    <BaseLayout preview="Your RePrint account was suspended" heading="Account suspended">
      <Text>Hi {username},</Text>
      <Text>Your RePrint account was suspended and signed out everywhere. Reason: {reason}</Text>
      <Text>
        {until
          ? `You can log in again after ${until}.`
          : 'The suspension has no end date. Contact us if you think this is a mistake.'}
      </Text>
    </BaseLayout>
  )
}
