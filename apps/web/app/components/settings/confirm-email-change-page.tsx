import { copy } from '../../copy/index.js'

export function ConfirmEmailChangePage({
  changed,
  signedIn,
}: {
  changed: boolean
  signedIn: boolean
}) {
  const c = copy.settings.confirmEmail
  return (
    <section className="mx-auto max-w-md py-8">
      <h1 className="text-3xl font-semibold">{changed ? c.successTitle : c.failedTitle}</h1>
      {changed ? (
        <p className="mt-4 text-muted-foreground">{c.successBody}</p>
      ) : (
        <>
          <p role="alert" className="mt-4">
            {c.failedBody}
          </p>
          <p className="mt-2 text-muted-foreground">{c.failedHelp}</p>
        </>
      )}
      <p className="mt-6">
        <a className="text-link underline" href={signedIn ? '/' : '/login'}>
          {signedIn ? c.continue : c.logIn}
        </a>
      </p>
    </section>
  )
}
