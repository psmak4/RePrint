import { expect } from '@playwright/test'

const mailpitUrl = process.env.MAILPIT_API_URL ?? 'http://localhost:8025'

type MailpitSummary = { ID: string; Subject: string }
type MailpitMessage = { Subject: string; Text: string }

/** Polls the Mailpit API until a message addressed to `to` with a matching subject arrives. */
export async function waitForEmail(to: string, subject: RegExp): Promise<MailpitMessage> {
  let found: MailpitSummary | undefined
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
        )
        const body = (await response.json()) as { messages?: MailpitSummary[] }
        found = body.messages?.find((message) => subject.test(message.Subject))
        return found !== undefined
      },
      { message: `an email to ${to} matching ${subject}`, timeout: 20_000 },
    )
    .toBe(true)
  const response = await fetch(`${mailpitUrl}/api/v1/message/${found?.ID}`)
  return (await response.json()) as MailpitMessage
}

/** Returns the first link in the email text whose path starts with `path` (for example `/verify-email`). */
export function linkInEmail(message: MailpitMessage, path: string): string {
  const match = message.Text.match(new RegExp(`https?://[^\\s<>"]+${path}\\?[^\\s<>"]+`))
  if (!match) throw new Error(`No ${path} link in email "${message.Subject}"`)
  return match[0]
}
