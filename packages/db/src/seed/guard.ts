/** Hosts the seed may write to. Seeds and resets are destructive, so anything else is refused. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
  )
}

/** Throws unless it is safe to seed or reset: not production, and a local database host. */
export function assertSeedAllowed(databaseUrl: string, nodeEnv: string | undefined): void {
  if (nodeEnv === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production')
  }
  let hostname: string
  try {
    hostname = new URL(databaseUrl).hostname
  } catch {
    throw new Error('Refusing to seed: DATABASE_URL is not a valid URL')
  }
  if (!isLocalHost(hostname)) {
    throw new Error(`Refusing to seed: database host "${hostname}" is not local`)
  }
}
