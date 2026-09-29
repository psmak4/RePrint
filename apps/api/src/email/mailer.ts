import { createTransport } from 'nodemailer'
import { Resend } from 'resend'
import type { Env } from '../config/env.js'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
}

export interface Mailer {
  /** Resolves once the transport accepted the message; throws so the job can retry. */
  send: (email: OutgoingEmail) => Promise<void>
  close: () => void
}

export type MailerSettings = Pick<
  Env,
  'EMAIL_TRANSPORT' | 'EMAIL_FROM' | 'SMTP_HOST' | 'SMTP_PORT' | 'RESEND_API_KEY'
>

/** Picks the transport from the environment: SMTP (Mailpit) or Resend. */
export function createMailer(settings: MailerSettings): Mailer {
  const from = settings.EMAIL_FROM
  if (settings.EMAIL_TRANSPORT === 'resend') {
    if (!settings.RESEND_API_KEY)
      throw new Error('RESEND_API_KEY is required for the resend transport')
    const resend = new Resend(settings.RESEND_API_KEY)
    return {
      send: async (email) => {
        const { error } = await resend.emails.send({ from, ...email })
        if (error) throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`)
      },
      close: () => {},
    }
  }
  const transport = createTransport({
    host: settings.SMTP_HOST,
    port: settings.SMTP_PORT,
    secure: false,
  })
  return {
    send: async (email) => {
      await transport.sendMail({ from, ...email })
    },
    close: () => transport.close(),
  }
}
