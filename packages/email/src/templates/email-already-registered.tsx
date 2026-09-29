import { Text } from '@react-email/components'
import { z } from 'zod'
import { BaseLayout } from '../layout.js'

export const emailAlreadyRegisteredProps = z.object({
  username: z.string().min(1),
  /** Where the Member can log in or reset their password. */
  loginUrl: z.url(),
})

export type EmailAlreadyRegisteredProps = z.infer<typeof emailAlreadyRegisteredProps>

export const emailAlreadyRegisteredSubject = 'Someone tried to register with your email'

export function EmailAlreadyRegistered({ username, loginUrl }: EmailAlreadyRegisteredProps) {
  return (
    <BaseLayout
      preview="Someone tried to create a RePrint account with your email"
      heading="Someone used your email to sign up"
    >
      <Text>Hi {username},</Text>
      <Text>
        Someone tried to create a RePrint account with this email address, but you already have one.
        Nothing changed on your account.
      </Text>
      <Text>If it was you, log in here (or use "Forgot password" if you need to):</Text>
      <Text style={{ wordBreak: 'break-all' }}>{loginUrl}</Text>
      <Text>If it was not you, you can ignore this email.</Text>
    </BaseLayout>
  )
}
