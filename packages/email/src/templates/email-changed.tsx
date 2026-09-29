import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const emailChangedProps = z.object({
  username: z.string().min(1),
  oldEmail: z.email(),
  newEmail: z.email(),
  /** Where the Member can reset their password if they did not make this change. */
  resetUrl: z.url(),
})

export type EmailChangedProps = z.infer<typeof emailChangedProps>

export const emailChangedSubject = 'Your email address was changed'

export function EmailChanged({ username, oldEmail, newEmail, resetUrl }: EmailChangedProps) {
  return (
    <BaseLayout
      preview="The email address on your RePrint account was changed"
      heading="Email address changed"
    >
      <Text>Hi {username},</Text>
      <Text>
        The email address on your RePrint account was changed from {oldEmail} to {newEmail}. You
        will log in with the new address from now on.
      </Text>
      <Text>If it was not you, reset your password now: {resetUrl}</Text>
    </BaseLayout>
  )
}
