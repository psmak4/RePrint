import type { Mailer, OutgoingEmail } from '../email/mailer.js'

/** A mailer that keeps what it was asked to send, for tests that don't need a real transport. */
export function recordingMailer(): { mailer: Mailer; sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = []
  return {
    sent,
    mailer: {
      send: async (email) => {
        sent.push(email)
      },
      close: () => {},
    },
  }
}
