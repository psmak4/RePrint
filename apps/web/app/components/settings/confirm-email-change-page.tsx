import { copy } from '../../copy/index.js'
import { AuthCard, AuthNextLink } from '../auth/auth-card.js'

export function ConfirmEmailChangePage({
  changed,
  signedIn,
}: {
  changed: boolean
  signedIn: boolean
}) {
  const c = copy.settings.confirmEmail
  return (
    <AuthCard
      title={changed ? c.successTitle : c.failedTitle}
      lead={changed ? c.successBody : undefined}
    >
      {changed ? null : (
        <>
          <p role="alert" className="mt-3 text-[15px] leading-relaxed">
            {c.failedBody}
          </p>
          <p className="mt-2 text-[15px] text-muted-foreground">{c.failedHelp}</p>
        </>
      )}
      <AuthNextLink href={signedIn ? '/' : '/login'}>
        {signedIn ? c.continue : c.logIn}
      </AuthNextLink>
    </AuthCard>
  )
}
