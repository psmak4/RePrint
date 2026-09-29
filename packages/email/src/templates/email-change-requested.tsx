import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const emailChangeRequestedProps = z.object({
  username: z.string().min(1),
  /** The address the change would switch to. */
  newEmail: z.email(),
  /** Where the Member can reset their password if they did not ask for this. */
  resetUrl: z.url(),
})

export type EmailChangeRequestedProps = z.infer<typeof emailChangeRequestedProps>

export const emailChangeRequestedSubject = 'Email change requested for your account'

export function EmailChangeRequested({ username, newEmail, resetUrl }: EmailChangeRequestedProps) {
  return (
    <BaseLayout
      preview="A change of email address was requested for your RePrint account"
      heading="Email change requested"
    >
      <Text>Hi {username},</Text>
      <Text>
        A change of your RePrint email address to {newEmail} was requested. Nothing changes until
        the link sent to that address is used. If this was you, no action is needed.
      </Text>
      <Text>If it was not you, reset your password now: {resetUrl}</Text>
    </BaseLayout>
  )
}
