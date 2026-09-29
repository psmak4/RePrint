import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const passwordChangedProps = z.object({
  username: z.string().min(1),
  /** Where the Member can request another reset if they did not make this change. */
  resetUrl: z.url(),
})

export type PasswordChangedProps = z.infer<typeof passwordChangedProps>

export const passwordChangedSubject = 'Your password was changed'

export function PasswordChanged({ username, resetUrl }: PasswordChangedProps) {
  return (
    <BaseLayout preview="Your RePrint password was changed" heading="Password changed">
      <Text>Hi {username},</Text>
      <Text>
        Your RePrint password was just changed, and you were signed out everywhere. If this was you,
        no action is needed.
      </Text>
      <Text>If it was not you, reset your password now: {resetUrl}</Text>
    </BaseLayout>
  )
}
