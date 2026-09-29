import { Button, Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const emailChangeConfirmProps = z.object({
  username: z.string().min(1),
  /** Link that switches the account to this address; single use, valid 24 hours. */
  confirmUrl: z.url(),
})

export type EmailChangeConfirmProps = z.infer<typeof emailChangeConfirmProps>

export const emailChangeConfirmSubject = 'Confirm your new email address'

export function EmailChangeConfirm({ username, confirmUrl }: EmailChangeConfirmProps) {
  return (
    <BaseLayout
      preview="Confirm this address to use it for your RePrint account"
      heading="Confirm your new email"
    >
      <Text>Hi {username},</Text>
      <Text>
        Someone asked to use this address for the RePrint account {username}. Confirm to make the
        change.
      </Text>
      <Button
        href={confirmUrl}
        style={{
          backgroundColor: '#3b82f6',
          color: '#f8fafc',
          padding: '12px 20px',
          borderRadius: 6,
        }}
      >
        Confirm email
      </Button>
      <Text>Or paste this link into your browser:</Text>
      <Text style={{ wordBreak: 'break-all' }}>{confirmUrl}</Text>
      <Text>
        The link works once and expires in 24 hours. Until you use it, your account keeps its
        current address. If this was not you, ignore this email.
      </Text>
    </BaseLayout>
  )
}
