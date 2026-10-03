import { useEffect } from 'react'
import { type AnalyticsConfig, loadAnalytics } from '../lib/analytics.js'

/** Loads the analytics script after hydration; renders nothing. */
export function Analytics({ config }: { config: AnalyticsConfig | null }) {
  useEffect(() => {
    if (config) loadAnalytics(config)
  }, [config])
  return null
}
