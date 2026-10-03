/** Cookieless analytics (Plausible, or Umami with the same variables; D-049). Off unless a domain is set. */
export type AnalyticsConfig = { domain: string; scriptUrl: string }

/** The success-metric events (PRD §2). */
export const ANALYTICS_EVENTS = {
  searchResultClick: 'Search Result Click',
  reviewSubmitted: 'Review Submitted',
  shelfAdded: 'Shelf Added',
} as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

const DEFAULT_SCRIPT_URL = 'https://plausible.io/js/script.js'

/** Reads the config from server env; null (analytics off) without a domain or with an unusable script URL. */
export function analyticsConfig(
  env: Record<string, string | undefined> = process.env,
): AnalyticsConfig | null {
  const domain = env.VITE_ANALYTICS_DOMAIN?.trim()
  if (!domain) return null
  const scriptUrl = env.VITE_ANALYTICS_SCRIPT_URL?.trim() || DEFAULT_SCRIPT_URL
  try {
    new URL(scriptUrl)
  } catch {
    return null
  }
  return { domain, scriptUrl }
}

/** Origin of the analytics script, for the CSP. Undefined when analytics is off. */
export function analyticsOrigin(config: AnalyticsConfig | null): string | undefined {
  return config ? new URL(config.scriptUrl).origin : undefined
}

type Tracker = ((name: string, options?: { props: Record<string, string> }) => void) & {
  q?: unknown[][]
}

declare global {
  interface Window {
    plausible?: Tracker
  }
}

/**
 * Adds the analytics script once. It is created from the nonced entry script, so the CSP's
 * `strict-dynamic` allows it without a nonce of its own.
 */
export function loadAnalytics(config: AnalyticsConfig): void {
  if (document.querySelector('script[data-analytics]')) return
  // Same queue stub as the provider's snippet: events fired before the script loads are replayed.
  if (!window.plausible) {
    const stub: Tracker = (...args) => {
      stub.q = stub.q ?? []
      stub.q.push(args)
    }
    window.plausible = stub
  }
  const script = document.createElement('script')
  script.defer = true
  script.src = config.scriptUrl
  script.dataset.domain = config.domain
  script.dataset.analytics = ''
  document.head.appendChild(script)
}

/** Sends a custom event; does nothing when analytics is off. */
export function trackEvent(name: AnalyticsEvent, props?: Record<string, string>): void {
  if (typeof window === 'undefined') return
  window.plausible?.(name, props ? { props } : undefined)
}
