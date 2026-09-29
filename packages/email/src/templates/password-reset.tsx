import { Button, Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const passwordResetProps = z.object({
  username: z.string().min(1),
  /** Link the Member opens to choose a new password; single use, valid 1 hour (PRD §7.1). */
  resetUrl: z.url(),
})

export type PasswordResetProps = z.infer<typeof passwordResetProps>

export const passwordResetSubject = 'Reset your password'

export function PasswordReset({ username, resetUrl }: PasswordResetProps) {
  return (
    <BaseLayout preview="Choose a new RePrint password" heading="Reset your password">
      <Text>Hi {username},</Text>
      <Text>We received a request to reset your RePrint password.</Text>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: '#3b82f6',
          color: '#f8fafc',
          padding: '12px 20px',
          borderRadius: 6,
        }}
      >
        Choose a new password
      </Button>
      <Text>Or paste this link into your browser:</Text>
      <Text style={{ wordBreak: 'break-all' }}>{resetUrl}</Text>
      <Text>
        The link works once and expires in 1 hour. If you did not ask for this, you can ignore this
        email; your password has not changed.
      </Text>
    </BaseLayout>
  )
}
