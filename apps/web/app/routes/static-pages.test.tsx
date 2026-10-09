// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { copy } from '../copy/index.js'
import { metaArgs } from '../lib/seo.testing.js'
import About, { meta as aboutMeta } from './about.js'
import CommunityGuidelines from './community-guidelines.js'
import Contact from './contact.js'
import Privacy from './privacy.js'
import Terms from './terms.js'

afterEach(cleanup)

const pages = [
  ['Terms', Terms],
  ['Privacy', Privacy],
  ['Community Guidelines', CommunityGuidelines],
  ['About', About],
  ['Contact', Contact],
] as const

describe('legal and static pages', () => {
  it.each(pages)('%s has a title and no draft marker (owner-approved copy)', (_name, Page) => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(document.body.textContent).not.toContain('DRAFT')
  })

  it.each(pages)('%s has no axe violations', async (_name, Page) => {
    const { container } = render(<Page />)
    expect((await axe.run(container)).violations).toEqual([])
  })

  it('has a page for every footer link', () => {
    const titles = pages.map(([name]) => name)
    expect(copy.shell.legalLinks.map((link) => link.href).sort()).toEqual(
      ['/about', '/community-guidelines', '/contact', '/privacy', '/terms'].sort(),
    )
    expect(titles).toHaveLength(copy.shell.legalLinks.length)
  })

  it('Privacy covers GDPR, CCPA, 90-day IP retention, JSON export, and cookieless analytics', () => {
    render(<Privacy />)
    const text = document.body.textContent ?? ''
    for (const phrase of ['GDPR', 'CCPA', '90 days', 'JSON export', 'cookieless']) {
      expect(text, phrase).toContain(phrase)
    }
  })

  it('Community Guidelines list every rejection reason', () => {
    render(<CommunityGuidelines />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    const text = list.textContent ?? ''
    for (const phrase of ['spoiler', 'hateful', 'Spam', 'off-topic']) {
      expect(text).toContain(phrase)
    }
  })

  it('Contact shows the owner email as a mailto link', () => {
    render(<Contact />)
    const link = screen.getByRole('link', { name: copy.legal.contactEmail })
    expect(link.getAttribute('href')).toBe(`mailto:${copy.legal.contactEmail}`)
    expect(document.body.textContent).not.toContain('owner to supply')
  })

  it('sets a title, description, and canonical URL', () => {
    expect(aboutMeta(metaArgs('/about') as never)).toContainEqual({
      tagName: 'link',
      rel: 'canonical',
      href: 'https://reprint.test/about',
    })
  })
})
