import { copy } from '../../copy/index.js'
import { AuthCard, AuthNextLink } from './auth-card.js'

export function VerifyEmailPage({ verified, signedIn }: { verified: boolean; signedIn: boolean }) {
  const c = copy.auth.verify
  const next = (
    <AuthNextLink href={signedIn ? '/' : '/login'}>{signedIn ? c.continue : c.logIn}</AuthNextLink>
  )
  if (verified) {
    return (
      <AuthCard title={c.successTitle} lead={c.successBody}>
        {next}
      </AuthCard>
    )
  }
  return (
    <AuthCard title={c.failedTitle}>
      <p role="alert" className="mt-3 text-[15px] leading-relaxed">
        {c.failedBody}
      </p>
      <p className="mt-2 text-[15px] text-muted-foreground">{c.failedHelp}</p>
      {next}
    </AuthCard>
  )
}
