// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANALYTICS_EVENTS,
  analyticsConfig,
  analyticsOrigin,
  loadAnalytics,
  trackEvent,
} from './analytics.js'

afterEach(() => {
  document.head.innerHTML = ''
  window.plausible = undefined
})

describe('analyticsConfig', () => {
  it('is off without a domain', () => {
    expect(analyticsConfig({})).toBeNull()
    expect(analyticsConfig({ VITE_ANALYTICS_DOMAIN: '  ' })).toBeNull()
  })

  it('defaults the script to Plausible and honours an override', () => {
    expect(analyticsConfig({ VITE_ANALYTICS_DOMAIN: 'reprint.test' })).toEqual({
      domain: 'reprint.test',
      scriptUrl: 'https://plausible.io/js/script.js',
    })
    expect(
      analyticsConfig({
        VITE_ANALYTICS_DOMAIN: 'reprint.test',
        VITE_ANALYTICS_SCRIPT_URL: 'https://stats.example.com/script.js',
      })?.scriptUrl,
    ).toBe('https://stats.example.com/script.js')
  })

  it('is off when the script URL is not a URL', () => {
    expect(
      analyticsConfig({ VITE_ANALYTICS_DOMAIN: 'reprint.test', VITE_ANALYTICS_SCRIPT_URL: 'nope' }),
    ).toBeNull()
  })
})

describe('analyticsOrigin', () => {
  it('is the script origin, or undefined when off', () => {
    expect(analyticsOrigin({ domain: 'd', scriptUrl: 'https://plausible.io/js/script.js' })).toBe(
      'https://plausible.io',
    )
    expect(analyticsOrigin(null)).toBeUndefined()
  })
})

describe('loadAnalytics', () => {
  it('adds one deferred script for the domain, however often it is called', () => {
    const config = { domain: 'reprint.test', scriptUrl: 'https://plausible.io/js/script.js' }
    loadAnalytics(config)
    loadAnalytics(config)
    const scripts = document.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.src).toBe(config.scriptUrl)
    expect(scripts[0]?.defer).toBe(true)
    expect(scripts[0]?.dataset.domain).toBe('reprint.test')
  })

  it('queues events fired before the script loads', () => {
    loadAnalytics({ domain: 'reprint.test', scriptUrl: 'https://plausible.io/js/script.js' })
    trackEvent(ANALYTICS_EVENTS.shelfAdded, { shelf: 'read' })
    expect(window.plausible?.q).toEqual([['Shelf Added', { props: { shelf: 'read' } }]])
  })
})

describe('trackEvent', () => {
  it('does nothing when analytics is off', () => {
    expect(() => trackEvent(ANALYTICS_EVENTS.reviewSubmitted)).not.toThrow()
  })

  it('passes the event name and props to the tracker', () => {
    const tracker = vi.fn()
    window.plausible = tracker
    trackEvent(ANALYTICS_EVENTS.searchResultClick)
    expect(tracker).toHaveBeenCalledWith('Search Result Click', undefined)
  })
})
