import { Button, Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const verifyEmailProps = z.object({
  username: z.string().min(1),
  /** Link the Member opens to verify; single use, valid 24 hours (PRD §7.1). */
  verifyUrl: z.url(),
})

export type VerifyEmailProps = z.infer<typeof verifyEmailProps>

export const verifyEmailSubject = 'Verify your email address'

export function VerifyEmail({ username, verifyUrl }: VerifyEmailProps) {
  return (
    <BaseLayout
      preview="Confirm your email to start reviewing on RePrint"
      heading="Verify your email"
    >
      <Text>Hi {username},</Text>
      <Text>Welcome to RePrint. Confirm your email address to write reviews and vote on them.</Text>
      <Button
        href={verifyUrl}
        style={{
          backgroundColor: '#3b82f6',
          color: '#f8fafc',
          padding: '12px 20px',
          borderRadius: 6,
        }}
      >
        Verify email
      </Button>
      <Text>Or paste this link into your browser:</Text>
      <Text style={{ wordBreak: 'break-all' }}>{verifyUrl}</Text>
      <Text>
        The link works once and expires in 24 hours. If you did not sign up, you can ignore this
        email.
      </Text>
    </BaseLayout>
  )
}
