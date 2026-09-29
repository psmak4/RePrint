/** Origin of a Sentry DSN, for the CSP `connect-src` list. Undefined when there is no valid DSN. */
export function sentryOrigin(dsn: string | undefined): string | undefined {
  if (!dsn) return undefined
  try {
    return new URL(dsn).origin
  } catch {
    return undefined
  }
}
